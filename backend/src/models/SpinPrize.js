const mongoose = require("mongoose");
const { CURRENCIES } = require("./constants");

const schema = new mongoose.Schema(
  {
    prizeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    currency: { type: String, enum: [...CURRENCIES, "none"], default: "none" },
    amount: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    weight: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

schema.index({ active: 1, sortOrder: 1 });
module.exports = mongoose.model("SpinPrize", schema);
