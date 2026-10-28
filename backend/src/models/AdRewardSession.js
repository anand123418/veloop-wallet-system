const mongoose = require("mongoose");
const { newId } = require("../utils/ids");

const schema = new mongoose.Schema(
  {
    sessionId: { type: String, default: () => newId("ad"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayKey: { type: String, required: true },
    startIdempotencyKey: { type: String, required: true },
    claimIdempotencyKey: String,
    status: { type: String, enum: ["STARTED", "CLAIMED", "EXPIRED"], default: "STARTED" },
    startedAt: { type: Date, required: true },
    eligibleAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    amount: { type: Number, required: true, min: 1 },
    transactionId: String,
    claimedAt: Date,
  },
  { timestamps: true }
);

schema.index({ userId: 1, startIdempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, dayKey: 1, status: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1 }, {
  unique: true,
  partialFilterExpression: { status: "STARTED" },
});
schema.index({ userId: 1, claimIdempotencyKey: 1 }, {
  unique: true,
  partialFilterExpression: { claimIdempotencyKey: { $type: "string" } },
});

module.exports = mongoose.model("AdRewardSession", schema);
