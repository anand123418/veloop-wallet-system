const mongoose = require("mongoose");
const { newId } = require("../utils/ids");

const schema = new mongoose.Schema(
  {
    playId: { type: String, default: () => newId("rps"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayKey: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    playerChoice: { type: String, enum: ["rock", "paper", "scissors"], required: true },
    opponentChoice: { type: String, enum: ["rock", "paper", "scissors"], required: true },
    outcome: { type: String, enum: ["WIN", "TIE", "LOSS"], required: true },
    rewardAmount: { type: Number, required: true, min: 0 },
    transactionId: String,
    playedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, dayKey: 1, playedAt: -1 });
module.exports = mongoose.model("RpsPlay", schema);
