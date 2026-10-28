const mongoose = require("mongoose");
const Withdrawal = require("../models/Withdrawal");
const AppError = require("../utils/AppError");
const { newId } = require("../utils/ids");
const env = require("../config/env");
const walletService = require("./walletService");
const payoutService = require("./payoutService");
const audit = require("./auditService");

/*
 * BALANCE STRATEGY: Option A. VEs are deducted immediately when the withdrawal
 * is created (ledger DEBIT, source WITHDRAWAL). If the request is later
 * REJECTED or CANCELLED, the same amount is returned with a ledger CREDIT
 * (source WITHDRAWAL_REFUND). The unique ledger index on
 * (user, currency, source, referenceId) makes a double refund impossible.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const VERIFY_MSG = "This request requires additional verification.";

// Which current states may move to each target state.
const ALLOWED_FROM = {
  PROCESSING: ["PENDING"],
  APPROVED: ["PENDING", "PROCESSING"],
  REJECTED: ["PENDING", "PROCESSING"],
  CANCELLED: ["PENDING"],
};
const TERMINAL = ["APPROVED", "REJECTED", "CANCELLED"];
const REFUNDING = ["REJECTED", "CANCELLED"];

const userView = (w) => ({
  withdrawalId: w.withdrawalId,
  method: w.method,
  optionId: w.optionId,
  currency: w.currency,
  currencyAmount: w.currencyAmount,
  payoutAmount: w.payoutAmount,
  payoutCurrency: w.payoutCurrency,
  payoutDetails: w.payoutDetails instanceof Map ? Object.fromEntries(w.payoutDetails) : w.payoutDetails,
  status: w.status,
  rejectionReason: w.rejectionReason,
  transactionId: w.transactionId,
  refundTransactionId: w.refundTransactionId,
  requestedAt: w.requestedAt,
  processedAt: w.processedAt,
});

const adminView = (w) => ({
  ...userView(w),
  userId: w.userId,
  reviewNote: w.reviewNote,
  statusHistory: w.statusHistory,
  ip: w.ip,
});

async function fraudCheck(user, ctx) {
  const since = new Date(Date.now() - DAY_MS);
  const recent = await Withdrawal.countDocuments({
    userId: user.id,
    createdAt: { $gte: since },
    status: { $nin: ["REJECTED", "CANCELLED"] },
  });
  if (recent >= env.maxWithdrawalsPerDay) {
    await audit.log({
      actor: user, action: "SUSPICIOUS_WITHDRAWAL_BLOCKED", targetUserId: user.id,
      targetType: "Withdrawal", metadata: { reason: "daily_limit", recent }, ctx,
    });
    throw new AppError(VERIFY_MSG, 403, "VERIFICATION_REQUIRED");
  }
}

async function createWithdrawal({ user, method, optionId, payoutDetails, idempotencyKey, ctx = {} }) {
  // Fast path for double-clicks / retries.
  const existing = await Withdrawal.findOne({ userId: user.id, idempotencyKey });
  if (existing) return { withdrawal: existing, duplicate: true };

  if (user.accountStatus !== "active") throw new AppError(VERIFY_MSG, 403, "VERIFICATION_REQUIRED");

  const { methodDoc, option } = await payoutService.resolveOption(method, optionId, user);
  const details = payoutService.validateDetails(methodDoc, payoutDetails);
  await fraudCheck(user, ctx);

  try {
    return await mongoose.connection.transaction(async (session) => {
      // Re-check inside the transaction (a parallel duplicate may have just committed).
      const dup = await Withdrawal.findOne({ userId: user.id, idempotencyKey }).session(session);
      if (dup) return { withdrawal: dup, duplicate: true };

      const withdrawalId = newId("wd");
      // 1) check + deduct (atomic)  2) ledger entry  (both inside debitWallet)
      const { wallet, transaction } = await walletService.debitWallet({
        userId: user.id,
        currency: option.currency,
        amount: option.requiredAmount, // price comes from the DB, never from the client
        source: "WITHDRAWAL",
        referenceId: withdrawalId,
        description: `${methodDoc.name} withdrawal (₹${option.payoutValue})`,
        metadata: { method, optionId },
        session,
      });

      // 3) withdrawal record
      const [withdrawal] = await Withdrawal.create(
        [{
          withdrawalId,
          userId: user.id,
          method,
          optionId,
          currency: option.currency,
          currencyAmount: option.requiredAmount,
          payoutAmount: option.payoutValue,
          payoutCurrency: option.payoutCurrency,
          payoutDetails: details,
          status: "PENDING",
          transactionId: transaction.transactionId,
          idempotencyKey,
          statusHistory: [{ status: "PENDING", at: new Date(), by: String(user.id) }],
          ip: ctx.ip,
        }],
        { session }
      );

      // 4) audit
      await audit.log({
        actor: user, action: "WITHDRAWAL_CREATED", targetUserId: user.id, targetType: "Withdrawal",
        referenceId: withdrawalId,
        metadata: { method, optionId, currencyAmount: option.requiredAmount, payoutAmount: option.payoutValue },
        ctx,
      }, session);

      return { withdrawal, wallet, duplicate: false };
    });
  } catch (err) {
    // Two identical requests raced: the unique (userId, idempotencyKey) index let only one commit.
    if (err.code === 11000 && String(err.message).includes("idempotencyKey")) {
      const winner = await Withdrawal.findOne({ userId: user.id, idempotencyKey });
      if (winner) return { withdrawal: winner, duplicate: true };
    }
    throw err;
  }
}

// Atomic state change. The status condition is in the update filter, so a
// withdrawal can be rejected/approved only once, even with parallel admin clicks.
async function transition({ withdrawalId, to, actor, note, reason, ownerOnly = false, ctx = {} }) {
  return mongoose.connection.transaction(async (session) => {
    const filter = { withdrawalId, status: { $in: ALLOWED_FROM[to] } };
    if (ownerOnly) filter.userId = actor.id;

    const set = { status: to };
    if (TERMINAL.includes(to)) set.processedAt = new Date();
    if (reason) set.rejectionReason = reason;
    if (note) set.reviewNote = note;

    const w = await Withdrawal.findOneAndUpdate(
      filter,
      { $set: set, $push: { statusHistory: { status: to, at: new Date(), by: String(actor.id), note } } },
      { new: true, session }
    );

    if (!w) {
      const scope = ownerOnly ? { withdrawalId, userId: actor.id } : { withdrawalId };
      const exists = await Withdrawal.exists(scope).session(session);
      if (!exists) throw new AppError("Withdrawal not found.", 404, "NOT_FOUND");
      throw new AppError(`This withdrawal can no longer be changed to ${to}.`, 409, "INVALID_TRANSITION");
    }

    if (REFUNDING.includes(to)) {
      const { transaction } = await walletService.creditWallet({
        userId: w.userId,
        currency: w.currency,
        amount: w.currencyAmount,
        source: "WITHDRAWAL_REFUND",
        referenceId: w.withdrawalId,
        description: `Refund for ${to.toLowerCase()} withdrawal`,
        session,
      });
      w.refundTransactionId = transaction.transactionId;
      await w.save({ session });
    }

    await audit.log({
      actor, action: `WITHDRAWAL_${to}`, targetUserId: w.userId, targetType: "Withdrawal",
      referenceId: w.withdrawalId, metadata: { reason, note, refunded: REFUNDING.includes(to) }, ctx,
    }, session);

    return w;
  });
}

async function listForUser(userId, { page, limit }) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    Withdrawal.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Withdrawal.countDocuments(filter),
  ]);
  return { withdrawals: items.map(userView), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function getForUser(userId, withdrawalId) {
  // Owner is part of the query: another user's id simply "does not exist".
  const w = await Withdrawal.findOne({ withdrawalId, userId });
  if (!w) throw new AppError("Withdrawal not found.", 404, "NOT_FOUND");
  return userView(w);
}

async function listForAdmin({ page, limit, status, userId }) {
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.userId = userId;
  const [items, total] = await Promise.all([
    Withdrawal.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Withdrawal.countDocuments(filter),
  ]);
  return { withdrawals: items.map(adminView), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { createWithdrawal, transition, listForUser, getForUser, listForAdmin, userView, adminView };
