const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const env = require("../config/env");

const AUTH_MSG = "Authentication required.";

// The user always comes from the verified token, never from the request body or query.
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new AppError(AUTH_MSG, 401, "AUTH_REQUIRED");

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(AUTH_MSG, 401, "AUTH_REQUIRED");
  }

  // Load fresh status on every request so bans and role changes apply immediately.
  const user = await User.findById(payload.sub).lean();
  if (!user) throw new AppError(AUTH_MSG, 401, "AUTH_REQUIRED");
  if (user.accountStatus === "banned") throw new AppError("This account is not available.", 403, "ACCOUNT_BANNED");

  req.user = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt,
  };
  next();
});

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return next(new AppError("You do not have permission to do this.", 403, "FORBIDDEN"));
  next();
};

// Rejects attempts like GET /api/wallet?userId=<someone else>.
const ownWalletOnly = (req, res, next) => {
  const supplied = req.query.userId ?? req.params.userId ?? req.body?.userId;
  if (supplied !== undefined && String(supplied) !== req.user.id) {
    return next(new AppError("You can only access your own wallet.", 403, "FORBIDDEN"));
  }
  next();
};

module.exports = { authenticate, requireAdmin, ownWalletOnly };
