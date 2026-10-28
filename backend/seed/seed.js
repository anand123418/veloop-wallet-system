// Usage: npm run seed          (payout config + demo users if missing)
//        npm run seed:reset    (wipes the demo users' wallet data, then re-creates it)
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const { connectDb } = require("../src/config/db");
const User = require("../src/models/User");
const Wallet = require("../src/models/Wallet");
const WalletTransaction = require("../src/models/WalletTransaction");
const Withdrawal = require("../src/models/Withdrawal");
const Exchange = require("../src/models/Exchange");
const Referral = require("../src/models/Referral");
const SpinPlay = require("../src/models/SpinPlay");
const walletService = require("../src/services/walletService");
const withdrawalService = require("../src/services/withdrawalService");
const referralService = require("../src/services/referralService");
const { seedPayoutConfig } = require("./payoutOptions");
const { seedWalletFeatures } = require("./walletFeatures");

const DEMO_EMAIL = "demo@veloop.test";
const ADMIN_EMAIL = "admin@veloop.test";

async function ensureUser(email, name, role, password) {
  let user = await User.findOne({ email });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await User.create({ email, name, role, passwordHash });
    await Wallet.create({ userId: user._id });
    console.log(`created ${role}: ${email}`);
  }
  return user;
}

async function reset() {
  const users = await User.find({ email: { $in: [DEMO_EMAIL, ADMIN_EMAIL] } }).select("_id");
  const ids = users.map((u) => u._id);
  // Native collection access bypasses the "immutable" model hooks on purpose (demo data only).
  await WalletTransaction.collection.deleteMany({ userId: { $in: ids } });
  await Withdrawal.collection.deleteMany({ userId: { $in: ids } });
  await Exchange.collection.deleteMany({ userId: { $in: ids } });
  await Referral.collection.deleteMany({ $or: [{ referrerId: { $in: ids } }, { referredUserId: { $in: ids } }] });
  await SpinPlay.collection.deleteMany({ userId: { $in: ids } });
  await Wallet.collection.deleteMany({ userId: { $in: ids } });
  await User.collection.deleteMany({ _id: { $in: ids } });
  console.log("demo data removed");
}

(async () => {
  await connectDb(env.mongoUri);
  if (process.argv.includes("--reset")) await reset();

  await seedPayoutConfig();
  console.log("payout methods and options seeded");
  await seedWalletFeatures();
  console.log("exchange rates and spin prizes seeded");

  const admin = await ensureUser(ADMIN_EMAIL, "Demo Admin", "admin", process.env.ADMIN_PASSWORD || "Admin@12345");
  const demo = await ensureUser(DEMO_EMAIL, "Demo User", "user", process.env.DEMO_PASSWORD || "Demo@12345");
  await Promise.all([
    referralService.assignReferralCode(admin._id),
    referralService.assignReferralCode(demo._id),
  ]);

  if ((await WalletTransaction.countDocuments({ userId: demo._id })) === 0) {
    // Every balance is built from ledger entries, so the ledger always explains the wallet.
    const credits = [
      ["ves", 100, "DAILY_REWARD", "Daily Reward"],
      ["ves", 500, "AD_REWARD", "Watch Ad Reward"],
      ["ves", 1500, "REFERRAL", "Referral Reward"],
      ["ves", 3000, "BONUS", "Welcome Bonus"],
      ["ves", 22300, "GAME_REWARD", "Game Reward"],
      ["sves", 5000, "REWARD", "Reward"],
      ["gems", 80, "REWARD", "Reward"],
      ["gems", 20, "REWARD", "Reward"],
      ["tokens", 500, "REWARD", "Reward"],
      ["spins", 3, "DAILY_REWARD", "Daily Spins"],
    ];
    for (const [i, [currency, amount, source, description]] of credits.entries()) {
      await walletService.creditWallet({ userId: demo._id, currency, amount, source, description, referenceId: `seed-${i}` });
    }

    // One real withdrawal through the normal flow (27,400 - 2,400 = 25,000 VEs), then approved by admin.
    const authUser = { id: demo._id.toString(), role: "user", accountStatus: "active", createdAt: demo.createdAt };
    const { withdrawal } = await withdrawalService.createWithdrawal({
      user: authUser, method: "upi", optionId: "upi_10",
      payoutDetails: { upiId: "demo@okbank" }, idempotencyKey: "seed-demo-withdrawal-1",
    });
    await withdrawalService.transition({
      withdrawalId: withdrawal.withdrawalId, to: "APPROVED",
      actor: { id: admin._id.toString(), role: "admin" }, note: "Demo data",
    });
    console.log("demo wallet created: VEs 25,000 / SVEs 5,000 / Gems 100 / Tokens 500 / Spins 3");
  }

  console.log(`\nDemo login:  ${DEMO_EMAIL} / ${process.env.DEMO_PASSWORD || "Demo@12345"}`);
  console.log(`Admin login: ${ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD || "Admin@12345"}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
