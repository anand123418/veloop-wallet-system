const mongoose = require("mongoose");
const MiningClaim = require("../models/MiningClaim");
const MiningSession = require("../models/MiningSession");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const { newId } = require("../utils/ids");
const walletService = require("./walletService");
const audit = require("./auditService");

const MINUTE_MS = 60 * 1000;
const MAX_AMOUNT = 1_000_000_000;

function sessionView(session, now = Date.now()) {
  const active = Boolean(session?.active);
  const startedAt = session?.startedAt || null;
  const lastClaimAt = session?.lastClaimAt || null;
  const maxDurationMs = env.miningMaxDurationHours * 60 * MINUTE_MS;
  const elapsedSessionMs = active && startedAt ? Math.min(now - startedAt.getTime(), maxDurationMs) : 0;
  const elapsedSinceClaimMs = active && lastClaimAt ? now - lastClaimAt.getTime() : 0;
  const sessionComplete = active && startedAt
    ? now - startedAt.getTime() >= maxDurationMs
    : false;
  const wholeMinutes = Math.floor(Math.min(elapsedSinceClaimMs, maxDurationMs - elapsedSessionMs + elapsedSinceClaimMs) / MINUTE_MS);
  const claimableMinutes = Math.max(0, Math.min(wholeMinutes, env.miningMaxDurationHours * 60 - Math.floor(
    startedAt && lastClaimAt ? (lastClaimAt.getTime() - startedAt.getTime()) / MINUTE_MS : 0
  )));
  const claimableVes = Math.min(claimableMinutes * env.miningRateVesPerMinute, MAX_AMOUNT);
  const cooldownRemainingSeconds = active
    ? Math.max(0, Math.ceil((env.miningClaimIntervalSeconds * 1000 - elapsedSinceClaimMs) / 1000))
    : 0;

  return {
    active,
    startedAt,
    lastClaimAt,
    rateVesPerMinute: env.miningRateVesPerMinute,
    claimIntervalSeconds: env.miningClaimIntervalSeconds,
    maxDurationHours: env.miningMaxDurationHours,
    claimableMinutes,
    claimableVes,
    sessionComplete,
    canClaim: active && (claimableVes > 0 || sessionComplete) && cooldownRemainingSeconds === 0,
    cooldownRemainingSeconds,
  };
}

async function getStatus(userId, now = Date.now()) {
  const session = await MiningSession.findOne({ userId }).lean();
  return sessionView(session, now);
}

async function start(user) {
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }
  const now = new Date();
  const existing = await MiningSession.findOne({ userId: user.id });
  if (existing?.active) {
    if (now.getTime() - existing.startedAt.getTime() >= env.miningMaxDurationHours * 60 * MINUTE_MS) {
      throw new AppError("Claim your accumulated mining reward before starting another session.", 409, "MINING_SESSION_COMPLETE");
    }
    return sessionView(existing.toObject(), now.getTime());
  }
  if (existing) {
    existing.active = true;
    existing.startedAt = now;
    existing.lastClaimAt = now;
    existing.stoppedAt = undefined;
    await existing.save();
    return sessionView(existing.toObject(), now.getTime());
  }
  try {
    const [created] = await MiningSession.create([{
      userId: user.id,
      active: true,
      startedAt: now,
      lastClaimAt: now,
    }]);
    return sessionView(created.toObject(), now.getTime());
  } catch (err) {
    if (err.code === 11000) {
      const winner = await MiningSession.findOne({ userId: user.id });
      if (winner?.active) return sessionView(winner.toObject(), now.getTime());
    }
    throw err;
  }
}

function claimView(claim) {
  return {
    claimId: claim.claimId,
    amount: claim.amount,
    minutesMined: claim.minutesMined,
    transactionId: claim.transactionId,
    claimedAt: claim.claimedAt,
  };
}

async function claim({ user, idempotencyKey, ctx = {} }) {
  const existing = await MiningClaim.findOne({ userId: user.id, idempotencyKey });
  if (existing) {
    return {
      claim: existing,
      duplicate: true,
      wallet: await walletService.getWallet(user.id),
      mining: await getStatus(user.id),
    };
  }
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }

  const now = new Date();
  try {
    return await mongoose.connection.transaction(async (dbSession) => {
      const duplicate = await MiningClaim.findOne({ userId: user.id, idempotencyKey }).session(dbSession);
      if (duplicate) {
        return {
          claim: duplicate,
          duplicate: true,
          wallet: await walletService.getWallet(user.id),
          mining: await getStatus(user.id),
        };
      }

      const miningSession = await MiningSession.findOne({ userId: user.id, active: true }).session(dbSession);
      if (!miningSession) throw new AppError("Start a mining session before claiming rewards.", 409, "MINING_NOT_ACTIVE");

      const elapsedSinceClaimMs = now.getTime() - miningSession.lastClaimAt.getTime();
      if (elapsedSinceClaimMs < env.miningClaimIntervalSeconds * 1000) {
        throw new AppError("Mining reward is not ready to claim yet.", 409, "MINING_COOLDOWN");
      }
      const maxDurationMs = env.miningMaxDurationHours * 60 * MINUTE_MS;
      const sessionElapsedMs = now.getTime() - miningSession.startedAt.getTime();
      const remainingSessionMs = Math.max(0, maxDurationMs - (miningSession.lastClaimAt.getTime() - miningSession.startedAt.getTime()));
      const minutesMined = Math.min(
        Math.floor(elapsedSinceClaimMs / MINUTE_MS),
        Math.floor(remainingSessionMs / MINUTE_MS)
      );
      const amount = Math.min(minutesMined * env.miningRateVesPerMinute, MAX_AMOUNT);
      const maxReached = sessionElapsedMs >= maxDurationMs;
      if (!minutesMined || !amount) {
        if (maxReached) {
          miningSession.active = false;
          miningSession.stoppedAt = now;
          await miningSession.save({ session: dbSession });
          return {
            claim: null,
            duplicate: false,
            wallet: await walletService.getWallet(user.id),
            mining: sessionView(miningSession.toObject(), now.getTime()),
            sessionCompleted: true,
          };
        }
        throw new AppError("There is no mining reward available yet.", 409, "MINING_REWARD_NOT_READY");
      }

      miningSession.lastClaimAt = new Date(miningSession.lastClaimAt.getTime() + minutesMined * MINUTE_MS);
      if (maxReached || miningSession.lastClaimAt.getTime() - miningSession.startedAt.getTime() >= maxDurationMs) {
        miningSession.active = false;
        miningSession.stoppedAt = now;
      }
      await miningSession.save({ session: dbSession });

      const claimId = newId("mine");
      const { wallet, transaction } = await walletService.creditWallet({
        userId: user.id,
        currency: "ves",
        amount,
        source: "MINING_REWARD",
        referenceId: claimId,
        description: `Mining reward (${minutesMined} minute${minutesMined === 1 ? "" : "s"})`,
        metadata: { minutesMined, rateVesPerMinute: env.miningRateVesPerMinute },
        session: dbSession,
      });
      const [record] = await MiningClaim.create([{
        claimId,
        userId: user.id,
        idempotencyKey,
        amount,
        minutesMined,
        transactionId: transaction.transactionId,
        claimedAt: now,
      }], { session: dbSession });
      await audit.log({
        actor: user,
        action: "MINING_REWARD_CLAIMED",
        targetUserId: user.id,
        targetType: "MiningClaim",
        referenceId: claimId,
        metadata: { amount, minutesMined },
        ctx,
      }, dbSession);
      return {
        claim: record,
        duplicate: false,
        wallet,
        mining: sessionView(miningSession.toObject(), now.getTime()),
      };
    });
  } catch (err) {
    if (err.code === 11000 && String(err.message).includes("idempotencyKey")) {
      const winner = await MiningClaim.findOne({ userId: user.id, idempotencyKey });
      if (winner) {
        return {
          claim: winner,
          duplicate: true,
          wallet: await walletService.getWallet(user.id),
          mining: await getStatus(user.id),
        };
      }
    }
    throw err;
  }
}

module.exports = { getStatus, start, claim, claimView, sessionView };
