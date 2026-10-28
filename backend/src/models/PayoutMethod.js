const mongoose = require("mongoose");

const fieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, default: "text" },
    placeholder: String,
    pattern: String, // regex source, validated server-side
    errorMessage: String,
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    method: { type: String, required: true, unique: true }, // upi, amazon, google_play
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    fields: [fieldSchema],
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PayoutMethod", schema);
