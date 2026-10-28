const Joi = require("joi");
const { CURRENCIES, CREDIT_SOURCES, DEBIT_SOURCES, WITHDRAWAL_STATUS } = require("../models/constants");

const objectId = Joi.string().hex().length(24);
const amount = Joi.number().integer().min(1).max(1_000_000_000).required();

exports.register = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  name: Joi.string().trim().min(1).max(80).required(),
  password: Joi.string().min(8).max(72).required(),
  referralCode: Joi.string().alphanum().uppercase().min(8).max(20),
});

exports.login = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().max(72).required(),
});

exports.pagination = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  currency: Joi.string().valid(...CURRENCIES),
  userId: Joi.string().max(40), // kept so ownWalletOnly can reject foreign ids
});

const walletChange = (sources) =>
  Joi.object({
    userId: objectId.required(),
    currency: Joi.string().valid(...CURRENCIES).required(),
    amount,
    source: Joi.string().valid(...sources).required(),
    referenceId: Joi.string().max(100),
    description: Joi.string().max(200),
  });

exports.adminCredit = walletChange(CREDIT_SOURCES.filter((s) => s !== "WITHDRAWAL_REFUND"));
exports.adminDebit = walletChange(DEBIT_SOURCES.filter((s) => s !== "WITHDRAWAL"));

// No amount field exists here on purpose.
exports.createWithdrawal = Joi.object({
  method: Joi.string().max(40).required(),
  optionId: Joi.string().max(60).required(),
  payoutDetails: Joi.object().pattern(Joi.string().max(40), Joi.string().max(200).allow("")).max(10).required(),
});

exports.adminList = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid(...WITHDRAWAL_STATUS),
  userId: objectId,
});

exports.userIdParam = Joi.object({ userId: objectId.required() });
exports.exchange = Joi.object({
  toCurrency: Joi.string().valid("sves", "gems", "tokens", "spins").required(),
  amount: Joi.number().integer().min(1).max(1_000_000_000).required(),
});
exports.gameGuess = Joi.object({
  guess: Joi.number().integer().min(1).max(5).required(),
});
exports.rpsPlay = Joi.object({
  choice: Joi.string().valid("rock", "paper", "scissors").required(),
});

exports.review = Joi.object({ note: Joi.string().max(300) });
exports.reject = Joi.object({ reason: Joi.string().trim().min(3).max(300).required(), note: Joi.string().max(300) });

exports.payoutOptionUpdate = Joi.object({
  active: Joi.boolean(),
  requiredAmount: Joi.number().integer().min(1).max(1_000_000_000),
  payoutValue: Joi.number().min(1).max(1_000_000),
}).min(1);

exports.idempotencyKey = Joi.string().pattern(/^[A-Za-z0-9_-]{8,64}$/).required();
