const rateLimit = require("express-rate-limit");
const env = require("../config/env");

const handler = (req, res) =>
  res.status(429).json({ success: false, message: "Too many requests. Please slow down and try again shortly.", code: "RATE_LIMITED" });

const make = (windowMs, max, keyGenerator) =>
  rateLimit({
    windowMs, max, handler,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    ...(keyGenerator ? { keyGenerator } : {}),
  });

// NOTE: the in-memory store is per process. Use a Redis store when running several instances.
const byUser = (req) => req.user?.id || "anonymous";

module.exports = {
  general: make(60 * 1000, 120),
  auth: make(15 * 60 * 1000, 10),                 // brute-force protection on login/register
  withdrawal: make(60 * 1000, 5, byUser),         // per user
  walletMutation: make(60 * 1000, 30, byUser),    // admin credit/debit etc.
};
