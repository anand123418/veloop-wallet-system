const crypto = require("crypto");
const mongoose = require("mongoose");
const Referral = require("../models/Referral");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const { newId } = require("../utils/ids");
const walletService = require("./walletService");
const audit = require("./auditService");

function newReferralCode() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

async function assignReferralCode(userId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const user = await User.findById(userId).select("referralCode").lean();
    if (!user) throw new AppError("User not found.", 404, "NOT_FOUND");
    if (user.referralCode) return user.referralCode;
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, referralCode: { $exists: false } },
        { $set: { referralCode: newReferralCode() } },
        { new: true, runValidators: true }
      ).select("referralCode").lean();
      if (updated?.referralCode) return updated.referralCode;
    } catch (err) {
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
  const user = await User.findById(userId).select("referralCode").lean();
  if (!user?.referralCode) throw new AppError("Could not create a referral code.", 500, "REFERRAL_CODE_ERROR");
  return user.referralCode;
}

async function rewardSignupReferral({ referrer, referredUser, session }) {
  const referralId = newId("ref");
  const rewardAmount = env.referralRewardVes;
  const reward = await walletService.creditWallet({
    userId: referrer._id,
    currency: "ves",
    amount: rewardAmount,
    source: "REFERRAL",
    referenceId: referralId,
    description: "Referral signup reward",
    metadata: { referredUserId: referredUser._id.toString() },
    session,
  });
  await Referral.create([{
    referralId,
    referrerId: referrer._id,
    referredUserId: referredUser._id,
    rewardAmount,
    rewardCurrency: "ves",
    transactionId: reward.transaction.transactionId,
  }], { session });
  await audit.log({
    actor: { id: referredUser._id.toString(), role: "user" },
    action: "REFERRAL_REWARD_CREDITED",
    targetUserId: referrer._id,
    targetType: "Referral",
    referenceId: referralId,
    metadata: { rewardAmount, rewardCurrency: "ves" },
  }, session);
}

async function getSummary(userId) {
  const referralCode = await assignReferralCode(userId);
  const [referrals, totals] = await Promise.all([
    Referral.find({ referrerId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("referralId rewardAmount rewardCurrency status createdAt")
      .lean(),
    Referral.aggregate([
      { $match: { referrerId: new mongoose.Types.ObjectId(String(userId)) } },
      { $group: { _id: null, count: { $sum: 1 }, earnedVes: { $sum: "$rewardAmount" } } },
    ]),
  ]);
  return {
    referralCode,
    totalReferrals: totals[0]?.count || 0,
    earnedVes: totals[0]?.earnedVes || 0,
    rewardPerSignup: env.referralRewardVes,
    referrals,
  };
}

module.exports = { newReferralCode, assignReferralCode, rewardSignupReferral, getSummary };
