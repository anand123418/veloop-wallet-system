const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const { CURRENCIES } = require("../models/constants");

// Wallet balance must equal: opening balance (0) + credits - debits.
async function reconcileUser(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  const rows = await WalletTransaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)), status: "COMPLETED" } },
    { $group: { _id: { currency: "$currency", type: "$type" }, total: { $sum: "$amount" } } },
  ]);

  const result = {};
  let ok = Boolean(wallet);
  for (const c of CURRENCIES) {
    const credits = rows.find((r) => r._id.currency === c && r._id.type === "CREDIT")?.total || 0;
    const debits = rows.find((r) => r._id.currency === c && r._id.type === "DEBIT")?.total || 0;
    const expected = credits - debits;
    const actual = wallet ? wallet[c] : null;
    const match = actual === expected;
    if (!match) ok = false;
    result[c] = { credits, debits, expected, actual, match };
  }
  return { userId: String(userId), ok, currencies: result };
}

async function reconcileAll() {
  const wallets = await Wallet.find({}).select("userId").lean();
  const reports = [];
  for (const w of wallets) reports.push(await reconcileUser(w.userId));
  return { checked: reports.length, mismatches: reports.filter((r) => !r.ok), ok: reports.every((r) => r.ok) };
}

module.exports = { reconcileUser, reconcileAll };
