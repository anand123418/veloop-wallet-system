require("dotenv").config();

const isTest = process.env.NODE_ENV === "test";
const missing = ["MONGO_URI", "JWT_SECRET"].filter((k) => !process.env[k]);
if (missing.length && !isTest) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env.`);
}
if (!isTest && process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}

const trustProxyHops = process.env.TRUST_PROXY === undefined ? 0 : Number(process.env.TRUST_PROXY);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY must be a non-negative integer.");
}
const referralRewardVes = process.env.REFERRAL_REWARD_VES === undefined
  ? 500
  : Number(process.env.REFERRAL_REWARD_VES);
if (process.env.REFERRAL_REWARD_VES !== undefined
  && (!Number.isSafeInteger(referralRewardVes) || referralRewardVes < 1 || referralRewardVes > 1_000_000_000)) {
  throw new Error("REFERRAL_REWARD_VES must be a whole number from 1 to 1000000000.");
}
const miningRateVesPerMinute = process.env.MINING_RATE_VES_PER_MINUTE === undefined
  ? 10
  : Number(process.env.MINING_RATE_VES_PER_MINUTE);
const miningClaimIntervalSeconds = process.env.MINING_CLAIM_INTERVAL_SECONDS === undefined
  ? 60
  : Number(process.env.MINING_CLAIM_INTERVAL_SECONDS);
const miningMaxDurationHours = process.env.MINING_MAX_DURATION_HOURS === undefined
  ? 8
  : Number(process.env.MINING_MAX_DURATION_HOURS);
const gameRewardVes = process.env.GAME_REWARD_VES === undefined ? 25 : Number(process.env.GAME_REWARD_VES);
const gameMaxAttempts = process.env.GAME_MAX_ATTEMPTS === undefined ? 3 : Number(process.env.GAME_MAX_ATTEMPTS);
const gameChallengeTtlMinutes = process.env.GAME_CHALLENGE_TTL_MINUTES === undefined
  ? 10
  : Number(process.env.GAME_CHALLENGE_TTL_MINUTES);
const adRewardVes = process.env.AD_REWARD_VES === undefined ? 25 : Number(process.env.AD_REWARD_VES);
const adRewardDailyLimit = process.env.AD_REWARD_DAILY_LIMIT === undefined ? 5 : Number(process.env.AD_REWARD_DAILY_LIMIT);
const adWatchDurationSeconds = process.env.AD_WATCH_DURATION_SECONDS === undefined
  ? 15
  : Number(process.env.AD_WATCH_DURATION_SECONDS);

for (const [name, value, max] of [
  ["MINING_RATE_VES_PER_MINUTE", miningRateVesPerMinute, 1_000_000],
  ["MINING_CLAIM_INTERVAL_SECONDS", miningClaimIntervalSeconds, 86_400],
  ["MINING_MAX_DURATION_HOURS", miningMaxDurationHours, 24 * 365],
  ["GAME_REWARD_VES", gameRewardVes, 1_000_000_000],
  ["GAME_MAX_ATTEMPTS", gameMaxAttempts, 10],
  ["GAME_CHALLENGE_TTL_MINUTES", gameChallengeTtlMinutes, 1_440],
  ["AD_REWARD_VES", adRewardVes, 1_000_000_000],
  ["AD_REWARD_DAILY_LIMIT", adRewardDailyLimit, 100],
  ["AD_WATCH_DURATION_SECONDS", adWatchDurationSeconds, 300],
]) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be a whole number from 1 to ${max}.`);
  }
}

module.exports = {
  env: process.env.NODE_ENV || "development",
  isTest,
  port: Number(process.env.PORT) || 5000,
  trustProxyHops,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || "test-only-secret-test-only-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  clientUrls: (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((s) => s.trim()),
  maxWithdrawalsPerDay: Number(process.env.MAX_WITHDRAWALS_PER_DAY) || 3,
  dailyRewardVes: Number(process.env.DAILY_REWARD_VES) || 100,
  referralRewardVes,
  miningRateVesPerMinute,
  miningClaimIntervalSeconds,
  miningMaxDurationHours,
  gameRewardVes,
  gameMaxAttempts,
  gameChallengeTtlMinutes,
  adRewardVes,
  adRewardDailyLimit,
  adWatchDurationSeconds,
};
