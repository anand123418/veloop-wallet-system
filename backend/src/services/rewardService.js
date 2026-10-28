const WalletTransaction = require("../models/WalletTransaction");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const walletService = require("./walletService");

/*
 * DAILY REWARD: one claim per user per calendar day (India time, IST).
 * The day is part of the ledger referenceId ("daily-2026-10-26"). The unique ledger
 * index on (userId, currency, source, referenceId) makes a second claim on the same
 * day impossible, even if two requests arrive at the same moment.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SOURCE = "DAILY_REWARD";
const CURRENCY = "ves";

const istDay = (now = Date.now()) => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);

function nextResetAt(now = Date.now()) {
  const ist = new Date(now + IST_OFFSET_MS);
  const midnightIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1);
  return new Date(midnightIst - IST_OFFSET_MS);
}

async function getDailyStatus(userId) {
  const claimed = Boolean(
    await WalletTransaction.exists({ userId, currency: CURRENCY, source: SOURCE, referenceId: `daily-${istDay()}` })
  );
  return { claimed, amount: env.dailyRewardVes, nextClaimAt: nextResetAt() };
}

async function claimDaily(userId) {
  const amount = env.dailyRewardVes; // set by the server, never by the client
  try {
    const result = await walletService.creditWallet({
      userId,
      currency: CURRENCY,
      amount,
      source: SOURCE,
      referenceId: `daily-${istDay()}`,
      description: "Daily Reward",
    });
    return { ...result, amount, nextClaimAt: nextResetAt() };
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError("You have already claimed today's reward. Come back tomorrow.", 409, "ALREADY_CLAIMED");
    }
    throw err;
  }
}

module.exports = { getDailyStatus, claimDaily, istDay };
