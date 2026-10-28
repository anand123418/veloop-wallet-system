const mongoose = require("mongoose");
const { newId } = require("../utils/ids");

const schema = new mongoose.Schema(
  {
    spinId: { type: String, default: () => newId("spin"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    prizeId: { type: String, required: true },
    prizeName: { type: String, required: true },
    rewardCurrency: { type: String, default: "none" },
    rewardAmount: { type: Number, required: true, min: 0 },
    debitTransactionId: { type: String, required: true },
    rewardTransactionId: String,
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model("SpinPlay", schema);
