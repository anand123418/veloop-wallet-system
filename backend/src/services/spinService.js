const crypto = require("crypto");
const mongoose = require("mongoose");
const SpinPlay = require("../models/SpinPlay");
const SpinPrize = require("../models/SpinPrize");
const AppError = require("../utils/AppError");
const { newId } = require("../utils/ids");
const walletService = require("./walletService");
const audit = require("./auditService");

const SPIN_COST = 1;

const prizeView = (prize, totalWeight) => ({
  prizeId: prize.prizeId,
  name: prize.name,
  currency: prize.currency,
  amount: prize.amount,
  chancePercent: Number(((prize.weight / totalWeight) * 100).toFixed(2)),
});

async function getPrizes() {
  const prizes = await SpinPrize.find({ active: true }).sort({ sortOrder: 1 }).lean();
  const totalWeight = prizes.reduce((total, prize) => total + prize.weight, 0);
  return {
    spinCost: SPIN_COST,
    spinCurrency: "spins",
    prizes: totalWeight ? prizes.map((prize) => prizeView(prize, totalWeight)) : [],
  };
}

function spinView(spin) {
  return {
    spinId: spin.spinId,
    prizeId: spin.prizeId,
    prizeName: spin.prizeName,
    rewardCurrency: spin.rewardCurrency,
    rewardAmount: spin.rewardAmount,
    debitTransactionId: spin.debitTransactionId,
    rewardTransactionId: spin.rewardTransactionId,
    createdAt: spin.createdAt,
  };
}

async function play({ user, idempotencyKey, ctx = {} }) {
  const existing = await SpinPlay.findOne({ userId: user.id, idempotencyKey });
  if (existing) return { spin: existing, duplicate: true, wallet: await walletService.getWallet(user.id) };
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }

  try {
    return await mongoose.connection.transaction(async (session) => {
      const duplicate = await SpinPlay.findOne({ userId: user.id, idempotencyKey }).session(session);
      if (duplicate) return { spin: duplicate, duplicate: true, wallet: await walletService.getWallet(user.id) };

      const prizes = await SpinPrize.find({ active: true }).sort({ sortOrder: 1 }).session(session).lean();
      const totalWeight = prizes.reduce((total, prize) => total + prize.weight, 0);
      if (!totalWeight) throw new AppError("Spin rewards are currently unavailable.", 503, "PRIZES_UNAVAILABLE");

      let ticket = crypto.randomInt(totalWeight);
      let prize = prizes.find((entry) => {
        ticket -= entry.weight;
        return ticket < 0;
      });
      if (!prize) throw new AppError("Spin rewards are currently unavailable.", 503, "PRIZES_UNAVAILABLE");

      const spinId = newId("spin");
      const debit = await walletService.debitWallet({
        userId: user.id,
        currency: "spins",
        amount: SPIN_COST,
        source: "SPIN_PLAY",
        referenceId: spinId,
        description: "Spin played",
        session,
      });
      let wallet = debit.wallet;
      let rewardTransactionId;
      if (prize.amount > 0 && prize.currency !== "none") {
        const reward = await walletService.creditWallet({
          userId: user.id,
          currency: prize.currency,
          amount: prize.amount,
          source: "SPIN_REWARD",
          referenceId: spinId,
          description: `Spin reward: ${prize.name}`,
          metadata: { prizeId: prize.prizeId },
          session,
        });
        wallet = reward.wallet;
        rewardTransactionId = reward.transaction.transactionId;
      }

      const [spin] = await SpinPlay.create([{
        spinId,
        userId: user.id,
        idempotencyKey,
        prizeId: prize.prizeId,
        prizeName: prize.name,
        rewardCurrency: prize.currency,
        rewardAmount: prize.amount,
        debitTransactionId: debit.transaction.transactionId,
        rewardTransactionId,
      }], { session });
      await audit.log({
        actor: user,
        action: "SPIN_PLAYED",
        targetUserId: user.id,
        targetType: "SpinPlay",
        referenceId: spinId,
        metadata: { prizeId: prize.prizeId, rewardCurrency: prize.currency, rewardAmount: prize.amount },
        ctx,
      }, session);
      return { spin, duplicate: false, wallet };
    });
  } catch (err) {
    if (err.code === 11000 && String(err.message).includes("idempotencyKey")) {
      const winner = await SpinPlay.findOne({ userId: user.id, idempotencyKey });
      if (winner) return { spin: winner, duplicate: true, wallet: await walletService.getWallet(user.id) };
    }
    throw err;
  }
}

module.exports = { getPrizes, play, spinView, prizeView };
