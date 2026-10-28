const crypto = require("crypto");
const mongoose = require("mongoose");
const AppError = require("../utils/AppError");
const RpsDailyQuota = require("../models/RpsDailyQuota");
const RpsPlay = require("../models/RpsPlay");
const walletService = require("./walletService");
const audit = require("./auditService");

const DAILY_PLAY_LIMIT = 5;
const WIN_REWARD_VES = 30;
const CHOICES = ["rock", "paper", "scissors"];

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function dailyView(quota, plays, now) {
  const todayKey = dayKey(now);
  const playsUsed = quota?.dayKey === todayKey ? quota.playsUsed : 0;
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    dayKey: todayKey,
    dailyLimit: DAILY_PLAY_LIMIT,
    playsUsed,
    playsRemaining: Math.max(0, DAILY_PLAY_LIMIT - playsUsed),
    rewardVes: WIN_REWARD_VES,
    resetsAt: tomorrow,
    recentPlays: plays.map((play) => playView(play)),
  };
}

function playView(play) {
  return {
    playId: play.playId,
    playerChoice: play.playerChoice,
    opponentChoice: play.opponentChoice,
    outcome: play.outcome,
    rewardAmount: play.rewardAmount,
    playedAt: play.playedAt,
  };
}

async function ensureQuota(userId, today) {
  try {
    return await RpsDailyQuota.findOneAndUpdate(
      { userId, dayKey: today },
      { $setOnInsert: { userId, dayKey: today, playsUsed: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const quota = await RpsDailyQuota.findOne({ userId, dayKey: today });
    if (!quota) throw error;
    return quota;
  }
}

async function getStatus(userId, now = new Date()) {
  const today = dayKey(now);
  const [quota, plays] = await Promise.all([
    RpsDailyQuota.findOne({ userId, dayKey: today }).lean(),
    RpsPlay.find({ userId, dayKey: today }).sort({ playedAt: -1 }).limit(DAILY_PLAY_LIMIT).lean(),
  ]);
  return dailyView(quota, plays, now);
}

function resolveOutcome(playerChoice, opponentChoice) {
  if (playerChoice === opponentChoice) return "TIE";
  const winsAgainst = { rock: "scissors", paper: "rock", scissors: "paper" };
  return winsAgainst[playerChoice] === opponentChoice ? "WIN" : "LOSS";
}

async function play({ user, choice, idempotencyKey, ctx = {}, now = new Date() }) {
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }

  const today = dayKey(now);
  const existing = await RpsPlay.findOne({ userId: user.id, idempotencyKey });
  if (existing) {
    return {
      play: existing,
      duplicate: true,
      wallet: await walletService.getWallet(user.id),
      daily: await getStatus(user.id, now),
    };
  }
  await ensureQuota(user.id, today);

  try {
    return await mongoose.connection.transaction(async (session) => {
      const previous = await RpsPlay.findOne({ userId: user.id, idempotencyKey }).session(session);
      if (previous) {
        return {
          play: previous,
          duplicate: true,
          wallet: await walletService.getWallet(user.id),
          daily: await getStatus(user.id, now),
        };
      }

      const quotaUpdate = await RpsDailyQuota.updateOne(
        { userId: user.id, dayKey: today, playsUsed: { $lt: DAILY_PLAY_LIMIT } },
        { $inc: { playsUsed: 1 } },
        { session }
      );
      if (quotaUpdate.modifiedCount !== 1) {
        throw new AppError("You have used all 5 Stone Paper Scissors plays for today. Come back after the daily reset.", 429, "DAILY_GAME_LIMIT");
      }

      const opponentChoice = CHOICES[crypto.randomInt(CHOICES.length)];
      const outcome = resolveOutcome(choice, opponentChoice);
      const rewardAmount = outcome === "WIN" ? WIN_REWARD_VES : 0;
      const playId = `rps_${crypto.randomUUID()}`;
      let wallet = await walletService.getWallet(user.id);
      let transactionId;

      if (rewardAmount > 0) {
        const reward = await walletService.creditWallet({
          userId: user.id,
          currency: "ves",
          amount: rewardAmount,
          source: "GAME_REWARD",
          referenceId: playId,
          description: "Stone Paper Scissors game reward",
          metadata: { gameType: "stone_paper_scissors", playerChoice: choice, opponentChoice },
          session,
        });
        wallet = reward.wallet;
        transactionId = reward.transaction.transactionId;
      }

      const [playRecord] = await RpsPlay.create([{
        playId,
        userId: user.id,
        dayKey: today,
        idempotencyKey,
        playerChoice: choice,
        opponentChoice,
        outcome,
        rewardAmount,
        transactionId,
        playedAt: now,
      }], { session });
      await audit.log({
        actor: user,
        action: "GAME_PLAYED",
        targetUserId: user.id,
        targetType: "RpsPlay",
        referenceId: playId,
        metadata: { gameType: "stone_paper_scissors", choice, opponentChoice, outcome, rewardAmount, dayKey: today },
        ctx,
      }, session);

      const quota = await RpsDailyQuota.findOne({ userId: user.id, dayKey: today }).session(session).lean();
      const plays = await RpsPlay.find({ userId: user.id, dayKey: today }).sort({ playedAt: -1 }).limit(DAILY_PLAY_LIMIT).session(session).lean();
      return {
        play: playRecord,
        duplicate: false,
        wallet,
        daily: dailyView(quota, plays, now),
      };
    });
  } catch (error) {
    if (error.code === 11000 && String(error.message).includes("idempotencyKey")) {
      const winner = await RpsPlay.findOne({ userId: user.id, idempotencyKey });
      if (winner) {
        return {
          play: winner,
          duplicate: true,
          wallet: await walletService.getWallet(user.id),
          daily: await getStatus(user.id, now),
        };
      }
    }
    throw error;
  }
}

module.exports = { DAILY_PLAY_LIMIT, WIN_REWARD_VES, getStatus, play, playView };
