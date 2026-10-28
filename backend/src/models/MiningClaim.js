const mongoose = require("mongoose");
const { newId } = require("../utils/ids");

const schema = new mongoose.Schema(
  {
    claimId: { type: String, default: () => newId("mine"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    minutesMined: { type: Number, required: true, min: 1 },
    transactionId: { type: String, required: true },
    claimedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, claimedAt: -1 });
module.exports = mongoose.model("MiningClaim", schema);
