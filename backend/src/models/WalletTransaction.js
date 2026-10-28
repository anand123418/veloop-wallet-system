const mongoose = require("mongoose");
const immutable = require("../utils/immutable");
const { newId } = require("../utils/ids");
const { CURRENCIES, CREDIT_SOURCES, DEBIT_SOURCES } = require("./constants");

const schema = new mongoose.Schema(
  {
    transactionId: { type: String, default: () => newId("txn"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    type: { type: String, enum: ["CREDIT", "DEBIT"], required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    source: { type: String, enum: [...CREDIT_SOURCES, ...DEBIT_SOURCES], required: true },
    referenceId: { type: String, maxlength: 100 },
    status: { type: String, enum: ["COMPLETED"], default: "COMPLETED" },
    description: { type: String, maxlength: 200 },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ referenceId: 1 });
// Same (user, currency, source, reference) can be recorded only once.
// This blocks double refunds and replayed reward credits.
schema.index(
  { userId: 1, currency: 1, source: 1, referenceId: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $type: "string" } } }
);

immutable(schema, "Ledger");
module.exports = mongoose.model("WalletTransaction", schema);
