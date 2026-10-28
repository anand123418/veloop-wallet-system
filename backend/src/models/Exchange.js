const mongoose = require("mongoose");
const { newId } = require("../utils/ids");
const { CURRENCIES } = require("./constants");

const schema = new mongoose.Schema(
  {
    exchangeId: { type: String, default: () => newId("ex"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    fromCurrency: { type: String, enum: CURRENCIES, required: true },
    fromAmount: { type: Number, required: true, min: 1 },
    toCurrency: { type: String, enum: CURRENCIES, required: true },
    toAmount: { type: Number, required: true, min: 1 },
    debitTransactionId: { type: String, required: true },
    creditTransactionId: { type: String, required: true },
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model("Exchange", schema);
