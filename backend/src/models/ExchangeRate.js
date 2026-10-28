const mongoose = require("mongoose");
const { CURRENCIES } = require("./constants");

const schema = new mongoose.Schema(
  {
    rateId: { type: String, required: true, unique: true },
    fromCurrency: { type: String, enum: CURRENCIES, required: true },
    toCurrency: { type: String, enum: CURRENCIES, required: true },
    fromAmount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    toAmount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.index({ active: 1, fromCurrency: 1, toCurrency: 1 });
module.exports = mongoose.model("ExchangeRate", schema);
