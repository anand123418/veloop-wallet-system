const mongoose = require("mongoose");
const Exchange = require("../models/Exchange");
const ExchangeRate = require("../models/ExchangeRate");
const AppError = require("../utils/AppError");
const { newId } = require("../utils/ids");
const walletService = require("./walletService");
const audit = require("./auditService");

const rateView = (rate) => ({
  rateId: rate.rateId,
  fromCurrency: rate.fromCurrency,
  fromAmount: rate.fromAmount,
  toCurrency: rate.toCurrency,
  toAmount: rate.toAmount,
});

async function getRates() {
  const rates = await ExchangeRate.find({ active: true }).sort({ toCurrency: 1 }).lean();
  return rates.map(rateView);
}

function exchangeView(exchange) {
  return {
    exchangeId: exchange.exchangeId,
    fromCurrency: exchange.fromCurrency,
    fromAmount: exchange.fromAmount,
    toCurrency: exchange.toCurrency,
    toAmount: exchange.toAmount,
    debitTransactionId: exchange.debitTransactionId,
    creditTransactionId: exchange.creditTransactionId,
    createdAt: exchange.createdAt,
  };
}

async function exchange({ user, toCurrency, amount, idempotencyKey, ctx = {} }) {
  const existing = await Exchange.findOne({ userId: user.id, idempotencyKey });
  if (existing) return { exchange: existing, duplicate: true, wallet: await walletService.getWallet(user.id) };
  if (user.accountStatus !== "active") {
    throw new AppError("This request requires additional verification.", 403, "VERIFICATION_REQUIRED");
  }

  const rate = await ExchangeRate.findOne({ fromCurrency: "ves", toCurrency, active: true }).lean();
  if (!rate) throw new AppError("This exchange is currently unavailable.", 400, "RATE_UNAVAILABLE");
  if (amount % rate.fromAmount !== 0) {
    throw new AppError(`VEs amount must be a multiple of ${rate.fromAmount}.`, 400, "INVALID_EXCHANGE_AMOUNT");
  }
  const toAmount = (amount / rate.fromAmount) * rate.toAmount;
  if (!Number.isSafeInteger(toAmount) || toAmount <= 0 || toAmount > 1_000_000_000) {
    throw new AppError("Exchange amount is outside the supported range.", 400, "INVALID_EXCHANGE_AMOUNT");
  }

  try {
    return await mongoose.connection.transaction(async (session) => {
      const duplicate = await Exchange.findOne({ userId: user.id, idempotencyKey }).session(session);
      if (duplicate) return { exchange: duplicate, duplicate: true, wallet: await walletService.getWallet(user.id) };

      const exchangeId = newId("ex");
      const debit = await walletService.debitWallet({
        userId: user.id,
        currency: rate.fromCurrency,
        amount,
        source: "EXCHANGE_DEBIT",
        referenceId: exchangeId,
        description: `Exchange ${amount} ${rate.fromCurrency.toUpperCase()} to ${toAmount} ${rate.toCurrency.toUpperCase()}`,
        metadata: { rateId: rate.rateId, toCurrency: rate.toCurrency },
        session,
      });
      const credit = await walletService.creditWallet({
        userId: user.id,
        currency: rate.toCurrency,
        amount: toAmount,
        source: "EXCHANGE_CREDIT",
        referenceId: exchangeId,
        description: `Exchange from ${amount} VEs`,
        metadata: { rateId: rate.rateId, fromCurrency: rate.fromCurrency },
        session,
      });
      const [record] = await Exchange.create([{
        exchangeId,
        userId: user.id,
        idempotencyKey,
        fromCurrency: rate.fromCurrency,
        fromAmount: amount,
        toCurrency: rate.toCurrency,
        toAmount,
        debitTransactionId: debit.transaction.transactionId,
        creditTransactionId: credit.transaction.transactionId,
      }], { session });
      await audit.log({
        actor: user,
        action: "CURRENCY_EXCHANGED",
        targetUserId: user.id,
        targetType: "Exchange",
        referenceId: exchangeId,
        metadata: { fromCurrency: rate.fromCurrency, fromAmount: amount, toCurrency: rate.toCurrency, toAmount },
        ctx,
      }, session);
      return { exchange: record, duplicate: false, wallet: credit.wallet };
    });
  } catch (err) {
    if (err.code === 11000 && String(err.message).includes("idempotencyKey")) {
      const winner = await Exchange.findOne({ userId: user.id, idempotencyKey });
      if (winner) return { exchange: winner, duplicate: true, wallet: await walletService.getWallet(user.id) };
    }
    throw err;
  }
}

module.exports = { getRates, exchange, exchangeView, rateView };
