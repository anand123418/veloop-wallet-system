const mongoose = require("mongoose");
const { newId } = require("../utils/ids");

const guessSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true },
    guess: { type: Number, required: true },
    correct: { type: Boolean, required: true },
    hint: { type: String, enum: ["HIGHER", "LOWER"] },
    attemptsRemaining: { type: Number, required: true },
    status: { type: String, enum: ["ACTIVE", "WON", "LOST", "EXPIRED"], required: true },
    rewardAmount: { type: Number, default: 0 },
    transactionId: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    challengeId: { type: String, default: () => newId("game"), unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    targetNumber: { type: Number, required: true, select: false },
    minNumber: { type: Number, required: true },
    maxNumber: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    rewardAmount: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ["ACTIVE", "WON", "LOST", "EXPIRED"], default: "ACTIVE" },
    attemptsUsed: { type: Number, default: 0 },
    guesses: [guessSchema],
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, expiresAt: 1 });
module.exports = mongoose.model("GameChallenge", schema);
