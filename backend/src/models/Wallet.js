const mongoose = require("mongoose");

const money = {
  type: Number,
  default: 0,
  min: 0,
  validate: { validator: Number.isSafeInteger, message: "{PATH} must be an integer" },
};

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    ves: money,
    sves: money,
    gems: money,
    tokens: money,
    spins: money,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);
