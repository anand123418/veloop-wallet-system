const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    active: { type: Boolean, default: false },
    startedAt: Date,
    lastClaimAt: Date,
    stoppedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("MiningSession", schema);
