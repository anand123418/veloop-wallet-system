const asyncHandler = require("../utils/asyncHandler");
const walletService = require("../services/walletService");
const withdrawalService = require("../services/withdrawalService");
const Withdrawal = require("../models/Withdrawal");

exports.getWallet = asyncHandler(async (req, res) => {
  const wallet = await walletService.getWallet(req.user.id);
  res.json({ success: true, wallet });
});

exports.getTransactions = asyncHandler(async (req, res) => {
  const { page, limit, currency } = req.query;
  const data = await walletService.getTransactions(req.user.id, { page, limit, currency });
  res.json({ success: true, ...data });
});

exports.getSummary = asyncHandler(async (req, res) => {
  const [wallet, recent, pendingWithdrawals] = await Promise.all([
    walletService.getWallet(req.user.id),
    walletService.getTransactions(req.user.id, { page: 1, limit: 5 }),
    Withdrawal.countDocuments({ userId: req.user.id, status: { $in: ["PENDING", "PROCESSING"] } }),
  ]);
  res.json({ success: true, wallet, recentTransactions: recent.transactions, pendingWithdrawals });
});
