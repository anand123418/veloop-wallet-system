const AuditLog = require("../models/AuditLog");

// Pass the same `session` as the money operation so the audit row commits
// (or rolls back) together with it.
async function log({ actor, action, targetUserId, targetType, referenceId, metadata, ctx = {} }, session) {
  await AuditLog.create(
    [{
      actorId: actor?.id,
      actorRole: actor?.role || "system",
      action,
      targetUserId,
      targetType,
      referenceId,
      metadata,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    }],
    { session }
  );
}

module.exports = { log };
