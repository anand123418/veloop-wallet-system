const mongoose = require("mongoose");
const { newId } = require("../utils/ids");
const { CURRENCIES, WITHDRAWAL_STATUS } = require("./constants");

const schema = new mongoose.Schema(
  {
    withdrawalId: { type: String, default: () => newId("wd"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    method: { type: String, required: true },
    optionId: { type: String, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    currencyAmount: { type: Number, required: true }, // VEs taken, decided by the server
    payoutAmount: { type: Number, required: true },   // e.g. rupees
    payoutCurrency: { type: String, default: "INR" },
    payoutDetails: { type: Map, of: String },
    status: { type: String, enum: WITHDRAWAL_STATUS, default: "PENDING" },
    rejectionReason: String,
    reviewNote: String,
    transactionId: String,       // ledger debit
    refundTransactionId: String, // ledger refund (rejected/cancelled)
    idempotencyKey: { type: String, required: true },
    statusHistory: [
      { _id: false, status: String, at: Date, by: String, note: String },
    ],
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
    ip: String,
  },
  { timestamps: true }
);

// One request per (user, key): the database itself stops duplicate submissions.
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ transactionId: 1 });

module.exports = mongoose.model("Withdrawal", schema);
