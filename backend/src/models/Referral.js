const mongoose = require("mongoose");
const { newId } = require("../utils/ids");

const schema = new mongoose.Schema(
  {
    referralId: { type: String, default: () => newId("ref"), unique: true },
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rewardAmount: { type: Number, required: true, min: 0 },
    rewardCurrency: { type: String, default: "ves" },
    transactionId: String,
    status: { type: String, enum: ["REWARDED"], default: "REWARDED" },
  },
  { timestamps: true }
);

schema.index({ referredUserId: 1 }, { unique: true });
schema.index({ referrerId: 1, createdAt: -1 });
module.exports = mongoose.model("Referral", schema);
