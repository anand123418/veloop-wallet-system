// Request metadata passed to services (keeps services independent of Express).
exports.reqCtx = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") });
