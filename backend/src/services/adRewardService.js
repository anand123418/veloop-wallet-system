const mongoose = require("mongoose");
const AdRewardDailyQuota = require("../models/AdRewardDailyQuota");
const AdRewardSession = require("../models/AdRewardSession");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const { newId } = require("../utils/ids");
const walletService = require("./walletService");

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;

function istDay(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function nextResetAt(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1) - IST_OFFSET_MS);
}

function sessionView(session) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    status: session.status,
    amount: session.amount,
    startedAt: session.startedAt,
    eligibleAt: session.eligibleAt,
    expiresAt: session.expiresAt,
    claimedAt: session.claimedAt,
  };
}

async function ensureQuota(userId, dayKey) {
  try {
    return await AdRewardDailyQuota.findOneAndUpdate(
      { userId, dayKey },
      { $setOnInsert: { userId, dayKey, claimsUsed: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const quota = await AdRewardDailyQuota.findOne({ userId, dayKey });
    if (!quota) throw error;
    return quota;
  }
}

async function expireStaleSessions(userId, dayKey, now) {
  await AdRewardSession.updateMany(
    {
      userId,
      status: "STARTED",
      $or: [{ expiresAt: { $lte: now } }, { dayKey: { $ne: dayKey } }],
    },
    { $set: { status: "EXPIRED" } }
  );
}

async function getStatus(userId, now = new Date()) {
  const dayKey = istDay(now);
  await expireStaleSessions(userId, dayKey, now);
  const [quota, activeSession] = await Promise.all([
    AdRewardDailyQuota.findOne({ userId, dayKey }).lean(),
    AdRewardSession.findOne({ userId, status: "STARTED", dayKey }).lean(),
  ]);
  const claimsUsed = quota?.claimsUsed || 0;
  return {
    amount: env.adRewardVes,
    dailyLimit: env.adRewardDailyLimit,
    claimsUsed,
    claimsRemaining: Math.max(0, env.adRewardDailyLimit - claimsUsed),
    watchDurationSeconds: env.adWatchDurationSeconds,
    resetsAt: nextResetAt(now),
    activeSession: sessionView(activeSession),
  };
}

async function start({ user, idempotencyKey, now = new Date() }) {
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }
  const dayKey = istDay(now);
  const prior = await AdRewardSession.findOne({ userId: user.id, startIdempotencyKey: idempotencyKey });
  if (prior) return { session: prior, duplicate: true, status: await getStatus(user.id, now) };

  await expireStaleSessions(user.id, dayKey, now);
  const active = await AdRewardSession.findOne({ userId: user.id, status: "STARTED", dayKey });
  if (active) return { session: active, duplicate: true, status: await getStatus(user.id, now) };

  const quota = await ensureQuota(user.id, dayKey);
  if (quota.claimsUsed >= env.adRewardDailyLimit) {
    throw new AppError("You have claimed all available ad rewards for today. Come back after the daily reset.", 429, "AD_REWARD_DAILY_LIMIT");
  }

  try {
    const [session] = await AdRewardSession.create([{
      sessionId: newId("ad"),
      userId: user.id,
      dayKey,
      startIdempotencyKey: idempotencyKey,
      status: "STARTED",
      startedAt: now,
      eligibleAt: new Date(now.getTime() + env.adWatchDurationSeconds * 1000),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      amount: env.adRewardVes,
    }]);
    return { session, duplicate: false, status: await getStatus(user.id, now) };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const [sameRequest, winner] = await Promise.all([
      AdRewardSession.findOne({ userId: user.id, startIdempotencyKey: idempotencyKey }),
      AdRewardSession.findOne({ userId: user.id, status: "STARTED", dayKey }),
    ]);
    const session = sameRequest || winner;
    if (!session) throw error;
    return { session, duplicate: true, status: await getStatus(user.id, now) };
  }
}

async function claim({ user, sessionId, idempotencyKey, ctx = {}, now = new Date() }) {
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }
  const priorClaim = await AdRewardSession.findOne({ userId: user.id, claimIdempotencyKey: idempotencyKey });
  if (priorClaim) {
    return {
      session: priorClaim,
      duplicate: true,
      wallet: await walletService.getWallet(user.id),
      status: await getStatus(user.id, now),
    };
  }

  const prior = await AdRewardSession.findOne({ userId: user.id, sessionId });
  if (!prior) throw new AppError("Ad reward session not found.", 404, "NOT_FOUND");
  if (prior.status === "CLAIMED") {
    return {
      session: prior,
      duplicate: true,
      wallet: await walletService.getWallet(user.id),
      status: await getStatus(user.id, now),
    };
  }
  if (prior.status !== "STARTED" || prior.dayKey !== istDay(now) || prior.expiresAt.getTime() <= now.getTime()) {
    if (prior.status === "STARTED") {
      prior.status = "EXPIRED";
      await prior.save();
    }
    throw new AppError("This ad session expired. Start a new one to try again.", 410, "AD_SESSION_EXPIRED");
  }
  if (prior.eligibleAt.getTime() > now.getTime()) {
    throw new AppError("Please finish the ad before claiming your reward.", 409, "AD_NOT_COMPLETE");
  }

  await ensureQuota(user.id, prior.dayKey);
  try {
    const result = await mongoose.connection.transaction(async (dbSession) => {
      const current = await AdRewardSession.findOne({ userId: user.id, sessionId })
        .session(dbSession);
      if (!current) throw new AppError("Ad reward session not found.", 404, "NOT_FOUND");
      if (current.status === "CLAIMED") {
        return {
          session: current,
          duplicate: true,
          wallet: await walletService.getWallet(user.id),
        };
      }
      if (current.status !== "STARTED" || current.dayKey !== istDay(now) || current.expiresAt.getTime() <= now.getTime()) {
        current.status = "EXPIRED";
        await current.save({ session: dbSession });
        return { expired: true };
      }
      if (current.eligibleAt.getTime() > now.getTime()) {
        throw new AppError("Please finish the ad before claiming your reward.", 409, "AD_NOT_COMPLETE");
      }

      const quotaUpdate = await AdRewardDailyQuota.updateOne(
        { userId: user.id, dayKey: current.dayKey, claimsUsed: { $lt: env.adRewardDailyLimit } },
        { $inc: { claimsUsed: 1 } },
        { session: dbSession }
      );
      if (quotaUpdate.modifiedCount !== 1) {
        throw new AppError("You have claimed all available ad rewards for today. Come back after the daily reset.", 429, "AD_REWARD_DAILY_LIMIT");
      }

      const transaction = await walletService.creditWallet({
        userId: user.id,
        currency: "ves",
        amount: current.amount,
        source: "AD_REWARD",
        referenceId: current.sessionId,
        description: "Watched ad reward",
        metadata: { adSessionId: current.sessionId },
        session: dbSession,
      });
      current.status = "CLAIMED";
      current.claimIdempotencyKey = idempotencyKey;
      current.claimedAt = now;
      current.transactionId = transaction.transaction.transactionId;
      await current.save({ session: dbSession });
      return {
        session: current,
        duplicate: false,
        wallet: transaction.wallet,
        transaction: transaction.transaction,
      };
    });

    if (result.expired) {
      throw new AppError("This ad session expired. Start a new one to try again.", 410, "AD_SESSION_EXPIRED");
    }
    return { ...result, status: await getStatus(user.id, now) };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const [sameKey, claimedSession] = await Promise.all([
      AdRewardSession.findOne({ userId: user.id, claimIdempotencyKey: idempotencyKey }),
      AdRewardSession.findOne({ userId: user.id, sessionId, status: "CLAIMED" }),
    ]);
    const winner = sameKey || claimedSession;
    if (!winner) throw error;
    return {
      session: winner,
      duplicate: true,
      wallet: await walletService.getWallet(user.id),
      status: await getStatus(user.id, now),
    };
  }
}

module.exports = { getStatus, start, claim, sessionView, istDay, nextResetAt };
