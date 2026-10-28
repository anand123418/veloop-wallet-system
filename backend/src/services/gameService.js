const crypto = require("crypto");
const mongoose = require("mongoose");
const GameChallenge = require("../models/GameChallenge");
const NumberGuessDailyQuota = require("../models/NumberGuessDailyQuota");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const { newId } = require("../utils/ids");
const walletService = require("./walletService");
const audit = require("./auditService");

const GAME_TYPE = "number_guess";
const MIN_NUMBER = 1;
const MAX_NUMBER = 5;
const DAILY_PLAY_LIMIT = 3;

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function dailyView(quota, now) {
  const todayKey = dayKey(now);
  const playsUsed = quota?.dayKey === todayKey ? quota.playsUsed : 0;
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    dayKey: todayKey,
    dailyLimit: DAILY_PLAY_LIMIT,
    playsUsed,
    playsRemaining: Math.max(0, DAILY_PLAY_LIMIT - playsUsed),
    resetsAt,
  };
}

function getConfig() {
  return {
    games: [{
      gameType: GAME_TYPE,
      name: "Number Guess",
      description: `Guess the hidden number from ${MIN_NUMBER} to ${MAX_NUMBER}.`,
      minNumber: MIN_NUMBER,
      maxNumber: MAX_NUMBER,
      maxAttempts: env.gameMaxAttempts,
      rewardVes: env.gameRewardVes,
      challengeTtlMinutes: env.gameChallengeTtlMinutes,
      dailyLimit: DAILY_PLAY_LIMIT,
    }],
  };
}

async function getDailyStatus(userId, now = new Date()) {
  const quota = await NumberGuessDailyQuota.findOne({ userId, dayKey: dayKey(now) }).lean();
  return dailyView(quota, now);
}

async function ensureQuota(userId, today) {
  try {
    return await NumberGuessDailyQuota.findOneAndUpdate(
      { userId, dayKey: today },
      { $setOnInsert: { userId, dayKey: today, playsUsed: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const quota = await NumberGuessDailyQuota.findOne({ userId, dayKey: today });
    if (!quota) throw error;
    return quota;
  }
}

function challengeView(challenge) {
  return {
    challengeId: challenge.challengeId,
    gameType: GAME_TYPE,
    minNumber: challenge.minNumber,
    maxNumber: challenge.maxNumber,
    maxAttempts: challenge.maxAttempts,
    rewardVes: challenge.rewardAmount,
    attemptsUsed: challenge.attemptsUsed,
    attemptsRemaining: Math.max(0, challenge.maxAttempts - challenge.attemptsUsed),
    status: challenge.status,
    expiresAt: challenge.expiresAt,
    guesses: challenge.guesses.map(({ guess, correct, hint, attemptsRemaining, status, rewardAmount, createdAt }) => ({
      guess, correct, hint, attemptsRemaining, status, rewardAmount, createdAt,
    })),
    ...(challenge.status !== "ACTIVE" ? { targetNumber: challenge.targetNumber } : {}),
  };
}

async function createChallenge({ user, idempotencyKey, now = new Date() }) {
  const existing = await GameChallenge.findOne({ userId: user.id, idempotencyKey });
  if (existing) return { challenge: existing, duplicate: true, daily: await getDailyStatus(user.id, now) };
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }
  const today = dayKey(now);
  await ensureQuota(user.id, today);
  try {
    return await mongoose.connection.transaction(async (session) => {
      const previous = await GameChallenge.findOne({ userId: user.id, idempotencyKey }).session(session);
      if (previous) {
        const quota = await NumberGuessDailyQuota.findOne({ userId: user.id, dayKey: today }).session(session).lean();
        return { challenge: previous, duplicate: true, daily: dailyView(quota, now) };
      }

      const quotaUpdate = await NumberGuessDailyQuota.updateOne(
        { userId: user.id, dayKey: today, playsUsed: { $lt: DAILY_PLAY_LIMIT } },
        { $inc: { playsUsed: 1 } },
        { session }
      );
      if (quotaUpdate.modifiedCount !== 1) {
        throw new AppError("You have used all 3 Number Guess plays for today. Come back after the daily reset.", 429, "DAILY_GAME_LIMIT");
      }

      const [challenge] = await GameChallenge.create([{
        userId: user.id,
        idempotencyKey,
        targetNumber: crypto.randomInt(MIN_NUMBER, MAX_NUMBER + 1),
        minNumber: MIN_NUMBER,
        maxNumber: MAX_NUMBER,
        maxAttempts: env.gameMaxAttempts,
        rewardAmount: env.gameRewardVes,
        expiresAt: new Date(now.getTime() + env.gameChallengeTtlMinutes * 60 * 1000),
      }], { session });
      const quota = await NumberGuessDailyQuota.findOne({ userId: user.id, dayKey: today }).session(session).lean();
      return { challenge, duplicate: false, daily: dailyView(quota, now) };
    });
  } catch (err) {
    if (err.code === 11000 && String(err.message).includes("idempotencyKey")) {
      const winner = await GameChallenge.findOne({ userId: user.id, idempotencyKey });
      if (winner) return { challenge: winner, duplicate: true, daily: await getDailyStatus(user.id, now) };
    }
    throw err;
  }
}

async function guess({ user, challengeId, guess, idempotencyKey, ctx = {} }) {
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }
  return mongoose.connection.transaction(async (session) => {
    const challenge = await GameChallenge.findOne({ challengeId, userId: user.id })
      .select("+targetNumber")
      .session(session);
    if (!challenge) throw new AppError("Game challenge not found.", 404, "NOT_FOUND");

    const previousGuess = challenge.guesses.find((entry) => entry.idempotencyKey === idempotencyKey);
    if (previousGuess) {
      const wallet = await walletService.getWallet(user.id);
      return { challenge, attempt: previousGuess, duplicate: true, wallet };
    }
    if (challenge.status !== "ACTIVE") throw new AppError("This game challenge is already complete.", 409, "GAME_COMPLETE");
    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.status = "EXPIRED";
      await challenge.save({ session });
      return { challenge, attempt: null, duplicate: false, wallet: await walletService.getWallet(user.id) };
    }

    const correct = guess === challenge.targetNumber;
    const hint = correct ? undefined : guess < challenge.targetNumber ? "HIGHER" : "LOWER";
    const attemptsUsed = challenge.attemptsUsed + 1;
    const attemptsRemaining = Math.max(0, challenge.maxAttempts - attemptsUsed);
    const status = correct ? "WON" : attemptsRemaining === 0 ? "LOST" : "ACTIVE";
    let rewardAmount = correct ? challenge.rewardAmount : 0;
    let transactionId;
    let wallet = await walletService.getWallet(user.id);

    if (rewardAmount > 0) {
      const reward = await walletService.creditWallet({
        userId: user.id,
        currency: "ves",
        amount: rewardAmount,
        source: "GAME_REWARD",
        referenceId: challenge.challengeId,
        description: "Number Guess game reward",
        metadata: { gameType: GAME_TYPE },
        session,
      });
      wallet = reward.wallet;
      transactionId = reward.transaction.transactionId;
    }

    const attempt = {
      idempotencyKey,
      guess,
      correct,
      hint,
      attemptsRemaining,
      status,
      rewardAmount,
      transactionId,
    };
    challenge.attemptsUsed = attemptsUsed;
    challenge.status = status;
    challenge.guesses.push(attempt);
    await challenge.save({ session });
    await audit.log({
      actor: user,
      action: "GAME_PLAYED",
      targetUserId: user.id,
      targetType: "GameChallenge",
      referenceId: challenge.challengeId,
      metadata: { gameType: GAME_TYPE, guess, correct, status, rewardAmount },
      ctx,
    }, session);
    return { challenge, attempt: challenge.guesses[challenge.guesses.length - 1], duplicate: false, wallet };
  });
}

module.exports = { DAILY_PLAY_LIMIT, getConfig, getDailyStatus, createChallenge, guess, challengeView };
