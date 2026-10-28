const mongoose = require("mongoose");
const immutable = require("../utils/immutable");

const schema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // empty = system
    actorRole: String,
    action: { type: String, required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetType: String,
    referenceId: String,
    metadata: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });
schema.index({ targetUserId: 1, createdAt: -1 });
schema.index({ referenceId: 1 });

immutable(schema, "Audit log");
module.exports = mongoose.model("AuditLog", schema);
