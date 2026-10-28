const mongoose = require("mongoose");
const { CURRENCIES } = require("./constants");

const schema = new mongoose.Schema(
  {
    optionId: { type: String, required: true, unique: true }, // e.g. upi_100
    method: { type: String, required: true, index: true },
    currency: { type: String, enum: CURRENCIES, default: "ves" },
    requiredAmount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    payoutValue: { type: Number, required: true, min: 1 },
    payoutCurrency: { type: String, default: "INR" },
    active: { type: Boolean, default: true },
    eligibility: { minAccountAgeDays: { type: Number, default: 0, min: 0 } },
    sortOrder: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

schema.index({ method: 1, active: 1, sortOrder: 1 });
module.exports = mongoose.model("PayoutOption", schema);
