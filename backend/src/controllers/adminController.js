const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { reqCtx } = require("../utils/context");
const User = require("../models/User");
const PayoutOption = require("../models/PayoutOption");
const AuditLog = require("../models/AuditLog");
const walletService = require("../services/walletService");
const withdrawalService = require("../services/withdrawalService");
const reconciliation = require("../services/reconciliationService");
const audit = require("../services/auditService");

// ---- wallet credit / debit (admin or trusted internal caller) ----
const adjust = (direction) =>
  asyncHandler(async (req, res) => {
    const { userId, currency, amount, source, referenceId, description } = req.body;
    if (!(await User.exists({ _id: userId }))) throw new AppError("User not found.", 404, "NOT_FOUND");

    const result = await mongoose.connection.transaction(async (session) => {
      const fn = direction === "CREDIT" ? walletService.creditWallet : walletService.debitWallet;
      const out = await fn({
        userId, currency, amount, source, referenceId,
        description: description || `${source} by admin`,
        metadata: { by: req.user.id },
        session,
      });
      await audit.log({
        actor: req.user,
        action: source === "CORRECTION" ? "BALANCE_CORRECTION" : direction === "CREDIT" ? "WALLET_CREDIT" : "WALLET_DEBIT",
        targetUserId: userId, targetType: "Wallet", referenceId: out.transaction.transactionId,
        metadata: { currency, amount, source, balanceBefore: out.transaction.balanceBefore, balanceAfter: out.transaction.balanceAfter },
        ctx: reqCtx(req),
      }, session);
      return out;
    });

    res.status(201).json({
      success: true,
      message: direction === "CREDIT" ? "Wallet credited." : "Wallet debited.",
      wallet: result.wallet,
      transaction: walletService.txView(result.transaction),
    });
  });
exports.credit = adjust("CREDIT");
exports.debit = adjust("DEBIT");

// ---- withdrawals ----
exports.listWithdrawals = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await withdrawalService.listForAdmin(req.query)) });
});

const review = (to) =>
  asyncHandler(async (req, res) => {
    const w = await withdrawalService.transition({
      withdrawalId: req.params.id, to, actor: req.user,
      note: req.body.note, reason: req.body.reason, ctx: reqCtx(req),
    });
    res.json({ success: true, message: `Withdrawal ${to.toLowerCase()}.`, withdrawal: withdrawalService.adminView(w) });
  });
exports.markProcessing = review("PROCESSING");
exports.approve = review("APPROVED");
exports.reject = review("REJECTED");

// ---- payout configuration ----
exports.updatePayoutOption = asyncHandler(async (req, res) => {
  const result = await mongoose.connection.transaction(async (session) => {
    const option = await PayoutOption.findOne({ optionId: req.params.optionId }).session(session);
    if (!option) throw new AppError("Payout option not found.", 404, "NOT_FOUND");
    const before = { active: option.active, requiredAmount: option.requiredAmount, payoutValue: option.payoutValue };
    Object.assign(option, req.body);
    await option.save({ session });
    await audit.log({
      actor: req.user, action: "PAYOUT_CONFIG_CHANGED", targetType: "PayoutOption",
      referenceId: option.optionId, metadata: { before, after: req.body }, ctx: reqCtx(req),
    }, session);
    return option;
  });
  res.json({ success: true, option: result });
});

// ---- audit + reconciliation ----
exports.auditLogs = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const [logs, total] = await Promise.all([
    AuditLog.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments({}),
  ]);
  res.json({ success: true, logs, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

exports.reconcileUser = asyncHandler(async (req, res) => {
  res.json({ success: true, report: await reconciliation.reconcileUser(req.params.userId) });
});
