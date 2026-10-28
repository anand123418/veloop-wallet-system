const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const referralService = require("./referralService");

const publicUser = (u) => ({
  id: u._id.toString(),
  email: u.email,
  name: u.name,
  role: u.role,
  referralCode: u.referralCode,
});
const signToken = (u) => jwt.sign({ sub: u._id.toString(), role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

async function register({ email, name, password, referralCode }) {
  if (await User.exists({ email: email.toLowerCase() })) {
    throw new AppError("An account with this email already exists.", 409, "EMAIL_EXISTS");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await mongoose.connection.transaction(async (session) => {
      const referrer = referralCode
        ? await User.findOne({ referralCode: referralCode.toUpperCase(), accountStatus: "active" }).session(session)
        : null;
      if (referralCode && !referrer) {
        throw new AppError("Referral code is invalid or unavailable.", 400, "INVALID_REFERRAL_CODE");
      }

      const [u] = await User.create([{
        email,
        name,
        passwordHash,
        referralCode: referralService.newReferralCode(),
        ...(referrer ? { referredBy: referrer._id } : {}),
      }], { session });
      await Wallet.create([{ userId: u._id }], { session });
      if (referrer) await referralService.rewardSignupReferral({ referrer, referredUser: u, session });
      return u;
    });
  } catch (err) {
    if (err.code === 11000) {
      if (err.message.includes("email")) {
        throw new AppError("An account with this email already exists.", 409, "EMAIL_EXISTS");
      }
      if (err.message.includes("referralCode")) {
        throw new AppError("Could not create a unique referral code. Please try again.", 503, "REFERRAL_CODE_RETRY");
      }
    }
    throw err;
  }
  return { token: signToken(user), user: publicUser(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  // Same message for unknown email and wrong password (no account enumeration).
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  if (user.accountStatus === "banned") throw new AppError("This account is not available.", 403, "ACCOUNT_BANNED");
  if (!user.referralCode) {
    user.referralCode = referralService.newReferralCode();
    await user.save();
  }
  return { token: signToken(user), user: publicUser(user) };
}

module.exports = { register, login, publicUser };
