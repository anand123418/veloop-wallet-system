const ExchangeRate = require("../src/models/ExchangeRate");
const SpinPrize = require("../src/models/SpinPrize");

const exchangeRates = [
  { rateId: "ves_sves", fromCurrency: "ves", fromAmount: 100, toCurrency: "sves", toAmount: 1 },
  { rateId: "ves_gems", fromCurrency: "ves", fromAmount: 250, toCurrency: "gems", toAmount: 1 },
  { rateId: "ves_tokens", fromCurrency: "ves", fromAmount: 20, toCurrency: "tokens", toAmount: 1 },
  { rateId: "ves_spins", fromCurrency: "ves", fromAmount: 1000, toCurrency: "spins", toAmount: 1 },
];

const spinPrizes = [
  { prizeId: "ves_10", name: "10 VEs", currency: "ves", amount: 10, weight: 40, sortOrder: 1 },
  { prizeId: "ves_50", name: "50 VEs", currency: "ves", amount: 50, weight: 25, sortOrder: 2 },
  { prizeId: "gems_1", name: "1 Gem", currency: "gems", amount: 1, weight: 10, sortOrder: 3 },
  { prizeId: "tokens_5", name: "5 Tokens", currency: "tokens", amount: 5, weight: 20, sortOrder: 4 },
  { prizeId: "no_prize", name: "No prize", currency: "none", amount: 0, weight: 5, sortOrder: 5 },
  { prizeId: "spins_1", name: "1 Extra Spin", currency: "spins", amount: 1, weight: 5, sortOrder: 6 },
  { prizeId: "ves_100", name: "100 VEs", currency: "ves", amount: 100, weight: 1, sortOrder: 7 },
];

async function seedWalletFeatures() {
  for (const rate of exchangeRates) {
    await ExchangeRate.updateOne(
      { rateId: rate.rateId },
      { $setOnInsert: { ...rate, active: true } },
      { upsert: true }
    );
  }
  for (const prize of spinPrizes) {
    await SpinPrize.updateOne(
      { prizeId: prize.prizeId },
      { $setOnInsert: { ...prize, active: true } },
      { upsert: true }
    );
  }
}

module.exports = { seedWalletFeatures, exchangeRates, spinPrizes };
