const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayKey: { type: String, required: true },
    claimsUsed: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

schema.index({ userId: 1, dayKey: 1 }, { unique: true });
module.exports = mongoose.model("AdRewardDailyQuota", schema);
