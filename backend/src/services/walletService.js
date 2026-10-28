const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const AppError = require("../utils/AppError");
const { CURRENCIES, CURRENCY_LABELS, CREDIT_SOURCES, DEBIT_SOURCES } = require("../models/constants");

const MAX_AMOUNT = 1_000_000_000;

// Run fn inside a MongoDB transaction, or join the caller's transaction if one is passed.
async function runInTransaction(fn, session) {
  if (session) return fn(session);
  return mongoose.connection.transaction(fn);
}

function assertCurrency(currency) {
  if (!CURRENCIES.includes(currency)) throw new AppError("Invalid currency.", 400, "INVALID_CURRENCY");
}

function assertAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new AppError("Amount must be a positive whole number.", 400, "INVALID_AMOUNT");
  }
}

const walletView = (w) => ({
  ves: w.ves, sves: w.sves, gems: w.gems, tokens: w.tokens, spins: w.spins, updatedAt: w.updatedAt,
});

const txView = (t) => ({
  transactionId: t.transactionId,
  type: t.type,
  currency: t.currency,
  amount: t.amount,
  balanceBefore: t.balanceBefore,
  balanceAfter: t.balanceAfter,
  source: t.source,
  referenceId: t.referenceId,
  status: t.status,
  description: t.description,
  createdAt: t.createdAt,
});

async function getWallet(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet) throw new AppError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  return walletView(wallet);
}

async function getTransactions(userId, { page = 1, limit = 20, currency } = {}) {
  const filter = { userId };
  if (currency) {
    assertCurrency(currency);
    filter.currency = currency;
  }
  const [items, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WalletTransaction.countDocuments(filter),
  ]);
  return {
    transactions: items.map(txView),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// Informational pre-check only. The real protection is the atomic
// conditional update inside debitWallet(); never rely on this alone.
async function validateBalance(userId, currency, amount) {
  assertCurrency(currency);
  assertAmount(amount);
  const wallet = await Wallet.findOne({ userId }).select(currency).lean();
  if (!wallet) throw new AppError("Wallet not found.", 404, "WALLET_NOT_FOUND");
  if (wallet[currency] < amount) {
    throw new AppError(`Insufficient ${CURRENCY_LABELS[currency]} balance.`, 400, "INSUFFICIENT_BALANCE");
  }
  return true;
}

async function createLedgerEntry(entry, session) {
  const [tx] = await WalletTransaction.create([entry], { session });
  return tx;
}

// One atomic step: conditional $inc on the wallet + ledger insert.
// For debits the balance check is part of the update filter, so two parallel
// requests can never both spend the same balance.
async function applyChange(
  { userId, currency, amount, direction, source, referenceId, description, metadata },
  session
) {
  assertCurrency(currency);
  assertAmount(amount);
  const allowed = direction === "CREDIT" ? CREDIT_SOURCES : DEBIT_SOURCES;
  if (!allowed.includes(source)) throw new AppError("Invalid transaction source.", 400, "INVALID_SOURCE");

  const sign = direction === "CREDIT" ? 1 : -1;
  const filter = { userId };
  if (direction === "DEBIT") filter[currency] = { $gte: amount };

  const wallet = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { [currency]: sign * amount } },
    { new: true, session }
  );

  if (!wallet) {
    const exists = await Wallet.exists({ userId }).session(session || null);
    if (!exists) throw new AppError("Wallet not found.", 404, "WALLET_NOT_FOUND");
    throw new AppError(`Insufficient ${CURRENCY_LABELS[currency]} balance.`, 400, "INSUFFICIENT_BALANCE");
  }

  const balanceAfter = wallet[currency];
  const transaction = await createLedgerEntry(
    {
      userId, currency, type: direction, amount,
      balanceBefore: balanceAfter - sign * amount,
      balanceAfter,
      source, referenceId, description, metadata,
    },
    session
  );
  return { wallet: walletView(wallet), transaction };
}

const creditWallet = (params) =>
  runInTransaction((s) => applyChange({ ...params, direction: "CREDIT" }, s), params.session);

const debitWallet = (params) =>
  runInTransaction((s) => applyChange({ ...params, direction: "DEBIT" }, s), params.session);

module.exports = {
  runInTransaction,
  getWallet,
  getTransactions,
  validateBalance,
  createLedgerEntry,
  creditWallet,
  debitWallet,
  walletView,
  txView,
};
