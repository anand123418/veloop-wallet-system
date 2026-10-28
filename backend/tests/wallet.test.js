/*
 * Integration tests for the 9 scenarios in the task. Uses an in-memory MongoDB
 * REPLICA SET so real multi-document transactions run (needs internet on first
 * run to download the MongoDB binary).
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-test-only-secret";
process.env.DAILY_REWARD_VES = "100";
process.env.REFERRAL_REWARD_VES = "500";
process.env.MINING_RATE_VES_PER_MINUTE = "10";
process.env.MINING_CLAIM_INTERVAL_SECONDS = "1";
process.env.AD_WATCH_DURATION_SECONDS = "1";

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replSet, app, models, svc;
let admin, counter = 0;

const api = () => request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const key = () => `key-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(ves = 0) {
  const email = `user${++counter}@veloop.test`;
  const res = await api().post("/api/auth/register").send({ email, name: "Test User", password: "Passw0rd!123" });
  expect(res.status).toBe(201);
  const userId = res.body.user.id;
  if (ves) await svc.wallet.creditWallet({ userId, currency: "ves", amount: ves, source: "BONUS", referenceId: `init-${userId}` });
  return { token: res.body.token, id: userId };
}

const getVes = async (u) => (await api().get("/api/wallet").set(auth(u.token))).body.wallet.ves;
const withdraw = (u, body, k = key()) =>
  api().post("/api/withdrawals").set(auth(u.token)).set("Idempotency-Key", k).send(body);
const upi = (optionId) => ({ method: "upi", optionId, payoutDetails: { upiId: "tester@okbank" } });

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replSet.getUri();
  app = require("../src/app");
  const { connectDb } = require("../src/config/db");
  await connectDb(process.env.MONGO_URI);
  models = {
    User: require("../src/models/User"),
    Withdrawal: require("../src/models/Withdrawal"),
    Tx: require("../src/models/WalletTransaction"),
    AdRewardSession: require("../src/models/AdRewardSession"),
    AdRewardDailyQuota: require("../src/models/AdRewardDailyQuota"),
    MiningSession: require("../src/models/MiningSession"),
    GameChallenge: require("../src/models/GameChallenge"),
  };
  svc = { wallet: require("../src/services/walletService"), recon: require("../src/services/reconciliationService") };
  await require("../seed/payoutOptions").seedPayoutConfig();
  await require("../seed/walletFeatures").seedWalletFeatures();

  const bcrypt = require("bcryptjs");
  await models.User.create({ email: "admin@veloop.test", name: "Admin", role: "admin", passwordHash: await bcrypt.hash("Admin@12345", 4) });
  await require("../src/models/Wallet").create({ userId: (await models.User.findOne({ role: "admin" }))._id });
  const login = await api().post("/api/auth/login").send({ email: "admin@veloop.test", password: "Admin@12345" });
  admin = { token: login.body.token };
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test("1. normal credit: 1000 + 500 = 1500", async () => {
  const u = await makeUser(1000);
  const res = await api().post("/api/wallet/credit").set(auth(admin.token))
    .send({ userId: u.id, currency: "ves", amount: 500, source: "ADMIN_CREDIT" });
  expect(res.status).toBe(201);
  expect(await getVes(u)).toBe(1500);
  expect(res.body.transaction).toMatchObject({ balanceBefore: 1000, balanceAfter: 1500, type: "CREDIT" });
});

test("2. normal debit/withdrawal: 1500 - 1000 = 500, and 25,000 - Rs100 (19,500) = 5,500", async () => {
  const u = await makeUser(1500);
  const d = await api().post("/api/wallet/debit").set(auth(admin.token))
    .send({ userId: u.id, currency: "ves", amount: 1000, source: "ADMIN_DEBIT" });
  expect(d.status).toBe(201);
  expect(await getVes(u)).toBe(500);

  const w = await makeUser(25000);
  const res = await withdraw(w, upi("upi_100"));
  expect(res.status).toBe(201);
  expect(res.body.withdrawal.status).toBe("PENDING");
  expect(await getVes(w)).toBe(5500);
  const tx = await api().get("/api/wallet/transactions?page=1&limit=10").set(auth(w.token));
  expect(tx.body.transactions[0]).toMatchObject({ type: "DEBIT", source: "WITHDRAWAL", amount: 19500 });
});

test("3. insufficient balance is rejected", async () => {
  const u = await makeUser(500);
  const res = await withdraw(u, upi("upi_10"));
  expect(res.status).toBe(400);
  expect(res.body.message).toBe("Insufficient VEs balance.");
  const d = await api().post("/api/wallet/debit").set(auth(admin.token))
    .send({ userId: u.id, currency: "ves", amount: 1000, source: "ADMIN_DEBIT" });
  expect(d.status).toBe(400);
  expect(await getVes(u)).toBe(500);
});

test("4. double-click: same Idempotency-Key twice (even in parallel) = one withdrawal, one debit", async () => {
  const u = await makeUser(20000);
  const k = key();
  const results = await Promise.all([withdraw(u, upi("upi_100"), k), withdraw(u, upi("upi_100"), k)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
  expect(results[0].body.withdrawal.withdrawalId).toBe(results[1].body.withdrawal.withdrawalId);
  expect(await getVes(u)).toBe(500); // 20,000 - 19,500, deducted once
  expect(await models.Withdrawal.countDocuments({ userId: u.id })).toBe(1);
  expect(await models.Tx.countDocuments({ userId: u.id, source: "WITHDRAWAL" })).toBe(1);
});

test("5. concurrent withdrawals: balance 10,000, two Rs50 (10,000 VEs) requests, only one succeeds", async () => {
  const u = await makeUser(10000);
  const results = await Promise.all([withdraw(u, upi("upi_50")), withdraw(u, upi("upi_50"))]);
  const codes = results.map((r) => r.status).sort();
  expect(codes).toEqual([201, 400]);
  expect(await getVes(u)).toBe(0);
  expect(await models.Withdrawal.countDocuments({ userId: u.id })).toBe(1);
});

test("6. invalid payout option / method mismatch / bad details are rejected", async () => {
  const u = await makeUser(50000);
  expect((await withdraw(u, upi("upi_fake"))).body.message).toBe("Selected payout option is unavailable.");
  expect((await withdraw(u, { method: "amazon", optionId: "upi_10", payoutDetails: { email: "a@b.co" } })).status).toBe(400);
  expect((await withdraw(u, { method: "paypal", optionId: "x", payoutDetails: {} })).body.message)
    .toBe("This payout method is currently unavailable.");
  expect((await withdraw(u, { method: "upi", optionId: "upi_10", payoutDetails: { upiId: "not valid" } })).status).toBe(400);
  expect(await getVes(u)).toBe(50000);
});

test("7. a user cannot read another user's wallet; unauthenticated is rejected", async () => {
  const a = await makeUser(100);
  const b = await makeUser(999);
  const res = await api().get(`/api/wallet?userId=${b.id}`).set(auth(a.token));
  expect(res.status).toBe(403);
  const own = await api().get("/api/wallet").set(auth(a.token));
  expect(own.body.wallet.ves).toBe(100);
  expect((await api().get("/api/wallet")).status).toBe(401);
  expect((await api().post("/api/wallet/credit").set(auth(a.token))
    .send({ userId: a.id, currency: "ves", amount: 5000, source: "ADMIN_CREDIT" })).status).toBe(403);
});

test("admin reconciliation rejects malformed user ids", async () => {
  const res = await api().get("/api/admin/reconcile/not-an-object-id").set(auth(admin.token));
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("VALIDATION_ERROR");
});

test("8. rejected withdrawal refunds exactly once", async () => {
  const u = await makeUser(25000);
  const w = await withdraw(u, upi("upi_100"));
  const id = w.body.withdrawal.withdrawalId;
  expect(await getVes(u)).toBe(5500);

  const rej = await api().patch(`/api/admin/withdrawals/${id}/reject`).set(auth(admin.token)).send({ reason: "Failed verification" });
  expect(rej.status).toBe(200);
  expect(await getVes(u)).toBe(25000);

  const again = await api().patch(`/api/admin/withdrawals/${id}/reject`).set(auth(admin.token)).send({ reason: "Failed verification" });
  expect(again.status).toBe(409);
  expect(await getVes(u)).toBe(25000);
  expect(await models.Tx.countDocuments({ userId: u.id, source: "WITHDRAWAL_REFUND" })).toBe(1);

  const approve = await api().patch(`/api/admin/withdrawals/${id}/approve`).set(auth(admin.token)).send({});
  expect(approve.status).toBe(409); // cannot approve a rejected request
});

test("9. API manipulation: client amount is ignored, server price is used", async () => {
  const u = await makeUser(25000);
  const res = await withdraw(u, { ...upi("upi_100"), amount: 1, currencyAmount: 1, payoutAmount: 100000 });
  expect(res.status).toBe(201);
  expect(res.body.withdrawal.currencyAmount).toBe(19500);
  expect(await getVes(u)).toBe(5500);
  // NoSQL injection attempt in a field
  const inj = await withdraw(u, { method: { $ne: "x" }, optionId: "upi_10", payoutDetails: { upiId: "a@okbank" } });
  expect(inj.status).toBe(400);
});

test("daily reward: one claim per day, even when sent twice at once", async () => {
  const u = await makeUser(0);
  const before = (await api().get("/api/rewards/daily").set(auth(u.token))).body;
  expect(before.claimed).toBe(false);

  const results = await Promise.all([
    api().post("/api/rewards/daily/claim").set(auth(u.token)),
    api().post("/api/rewards/daily/claim").set(auth(u.token)),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await getVes(u)).toBe(100);
  expect(await models.Tx.countDocuments({ userId: u.id, source: "DAILY_REWARD" })).toBe(1);

  const again = await api().post("/api/rewards/daily/claim").set(auth(u.token));
  expect(again.status).toBe(409);
  expect((await api().get("/api/rewards/daily").set(auth(u.token))).body.claimed).toBe(true);
  expect((await api().post("/api/rewards/daily/claim")).status).toBe(401);
});

test("ad rewards require a completed session, enforce the daily cap, and credit once", async () => {
  const user = await makeUser();
  const status = await api().get("/api/rewards/ad").set(auth(user.token));
  expect(status.status).toBe(200);
  expect(status.body).toMatchObject({
    amount: 25,
    dailyLimit: 5,
    claimsUsed: 0,
    claimsRemaining: 5,
    watchDurationSeconds: 1,
  });

  const createSession = async () => {
    const response = await api().post("/api/rewards/ad/start")
      .set(auth(user.token)).set("Idempotency-Key", key()).send({});
    expect([response.status]).toContain(201);
    expect(response.body.session.status).toBe("STARTED");
    const early = await api().post(`/api/rewards/ad/${response.body.session.sessionId}/claim`)
      .set(auth(user.token)).set("Idempotency-Key", key()).send({});
    expect(early.status).toBe(409);
    await models.AdRewardSession.updateOne(
      { sessionId: response.body.session.sessionId },
      { $set: { eligibleAt: new Date(Date.now() - 1000) } }
    );
    return response.body.session.sessionId;
  };

  const firstSessionId = await createSession();
  const claimKey = key();
  const claim = () => api().post(`/api/rewards/ad/${firstSessionId}/claim`)
    .set(auth(user.token)).set("Idempotency-Key", claimKey).send({});
  const [first, duplicate] = await Promise.all([claim(), claim()]);
  expect([first.status, duplicate.status].sort()).toEqual([200, 201]);
  expect(first.body.amount).toBe(25);
  expect(first.body.wallet.ves).toBe(25);

  for (let index = 1; index < 5; index += 1) {
    const sessionId = await createSession();
    const response = await api().post(`/api/rewards/ad/${sessionId}/claim`)
      .set(auth(user.token)).set("Idempotency-Key", key()).send({});
    expect(response.status).toBe(201);
    expect(response.body.claimsUsed).toBe(index + 1);
    expect(response.body.claimsRemaining).toBe(4 - index);
  }

  const cappedStart = await api().post("/api/rewards/ad/start")
    .set(auth(user.token)).set("Idempotency-Key", key()).send({});
  expect(cappedStart.status).toBe(429);
  expect(cappedStart.body.code).toBe("AD_REWARD_DAILY_LIMIT");
  expect(await getVes(user)).toBe(125);
  expect(await models.Tx.countDocuments({ userId: user.id, source: "AD_REWARD" })).toBe(5);
  expect(await models.AdRewardDailyQuota.findOne({ userId: user.id }).then((quota) => quota.claimsUsed)).toBe(5);
});

test("referral signup credits the inviter exactly once and exposes a share code", async () => {
  const inviter = await makeUser();
  const summaryBefore = await api().get("/api/referrals").set(auth(inviter.token));
  expect(summaryBefore.status).toBe(200);
  expect(summaryBefore.body.referralCode).toMatch(/^[A-F0-9]{12}$/);
  expect(summaryBefore.body.rewardPerSignup).toBe(500);

  const referred = await api().post("/api/auth/register").send({
    email: `referred${++counter}@veloop.test`,
    name: "Referred User",
    password: "Passw0rd!123",
    referralCode: summaryBefore.body.referralCode.toLowerCase(),
  });
  expect(referred.status).toBe(201);
  expect(referred.body.user.referralCode).toMatch(/^[A-F0-9]{12}$/);
  expect(await getVes(inviter)).toBe(500);

  const summaryAfter = await api().get("/api/referrals").set(auth(inviter.token));
  expect(summaryAfter.body).toMatchObject({ totalReferrals: 1, earnedVes: 500 });
  expect(summaryAfter.body.referrals).toHaveLength(1);
  const tx = await api().get("/api/wallet/transactions?limit=50").set(auth(inviter.token));
  expect(tx.body.transactions.filter((item) => item.source === "REFERRAL")).toHaveLength(1);
});

test("invalid referral code does not create an account", async () => {
  const res = await api().post("/api/auth/register").send({
    email: `invalid-ref${++counter}@veloop.test`,
    name: "Invalid Referral",
    password: "Passw0rd!123",
    referralCode: "NOTACODE123",
  });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("INVALID_REFERRAL_CODE");
});

test("exchange uses backend rates and idempotency to debit and credit atomically", async () => {
  const user = await makeUser(1000);
  const rates = await api().get("/api/exchanges/rates").set(auth(user.token));
  expect(rates.status).toBe(200);
  expect(rates.body.rates).toEqual(expect.arrayContaining([
    expect.objectContaining({ fromCurrency: "ves", fromAmount: 20, toCurrency: "tokens", toAmount: 1 }),
  ]));

  const idempotencyKey = key();
  const sendExchange = () => api().post("/api/exchanges")
    .set(auth(user.token))
    .set("Idempotency-Key", idempotencyKey)
    .send({ toCurrency: "tokens", amount: 500 });
  const [first, duplicate] = await Promise.all([sendExchange(), sendExchange()]);

  expect([first.status, duplicate.status].sort()).toEqual([200, 201]);
  expect(first.body.exchange).toMatchObject({ fromAmount: 500, toCurrency: "tokens", toAmount: 25 });
  expect(duplicate.status).toBe(200);
  expect(duplicate.body.exchange.exchangeId).toBe(first.body.exchange.exchangeId);
  const wallet = (await api().get("/api/wallet").set(auth(user.token))).body.wallet;
  expect(wallet.ves).toBe(500);
  expect(wallet.tokens).toBe(25);
  const tx = await api().get("/api/wallet/transactions?limit=50").set(auth(user.token));
  expect(tx.body.transactions.filter((item) => item.source === "EXCHANGE_DEBIT")).toHaveLength(1);
  expect(tx.body.transactions.filter((item) => item.source === "EXCHANGE_CREDIT")).toHaveLength(1);
});

test("exchange rejects non-multiple and insufficient amounts without changing balances", async () => {
  const user = await makeUser(100);
  const invalid = await api().post("/api/exchanges").set(auth(user.token)).set("Idempotency-Key", key())
    .send({ toCurrency: "gems", amount: 125 });
  expect(invalid.status).toBe(400);
  expect(invalid.body.code).toBe("INVALID_EXCHANGE_AMOUNT");

  const insufficient = await api().post("/api/exchanges").set(auth(user.token)).set("Idempotency-Key", key())
    .send({ toCurrency: "gems", amount: 250 });
  expect(insufficient.status).toBe(400);
  expect(insufficient.body.message).toBe("Insufficient VEs balance.");
  expect(await getVes(user)).toBe(100);
});

test("spin odds are public and an idempotent play spends one spin only", async () => {
  const user = await makeUser();
  await svc.wallet.creditWallet({
    userId: user.id, currency: "spins", amount: 2, source: "DAILY_REWARD", referenceId: `spins-${user.id}`,
  });
  const prizes = await api().get("/api/spin/prizes").set(auth(user.token));
  expect(prizes.status).toBe(200);
  expect(prizes.body.spinCost).toBe(1);
  expect(prizes.body.prizes.reduce((sum, prize) => sum + prize.chancePercent, 0)).toBe(100);
  expect(prizes.body.prizes).toEqual(expect.arrayContaining([
    expect.objectContaining({ prizeId: "spins_1", name: "1 Extra Spin", currency: "spins", amount: 1 }),
    expect.objectContaining({ prizeId: "ves_100", name: "100 VEs", currency: "ves", amount: 100 }),
  ]));

  const idempotencyKey = key();
  const sendSpin = () => api().post("/api/spin/play").set(auth(user.token))
    .set("Idempotency-Key", idempotencyKey).send({});
  const [first, duplicate] = await Promise.all([sendSpin(), sendSpin()]);
  expect([first.status, duplicate.status].sort()).toEqual([200, 201]);
  expect(duplicate.body.spin.spinId).toBe(first.body.spin.spinId);
  expect(first.body.wallet.spins).toBe(1);
  const tx = await api().get("/api/wallet/transactions?limit=50").set(auth(user.token));
  expect(tx.body.transactions.filter((item) => item.source === "SPIN_PLAY")).toHaveLength(1);
  expect(tx.body.transactions.filter((item) => item.source === "SPIN_REWARD")).toHaveLength(
    first.body.spin.rewardAmount > 0 ? 1 : 0
  );
});

test("spin cannot be played without an available spin", async () => {
  const user = await makeUser();
  const res = await api().post("/api/spin/play").set(auth(user.token)).set("Idempotency-Key", key()).send({});
  expect(res.status).toBe(400);
  expect(res.body.message).toBe("Insufficient Spins balance.");
});

test("mining accrues server-calculated VEs and duplicate claims do not credit twice", async () => {
  const user = await makeUser();
  const started = await api().post("/api/mining/start").set(auth(user.token)).send({});
  expect(started.status).toBe(200);
  expect(started.body.mining.active).toBe(true);

  const early = await api().post("/api/mining/claim").set(auth(user.token)).set("Idempotency-Key", key()).send({});
  expect(early.status).toBe(409);
  expect(early.body.code).toBe("MINING_COOLDOWN");

  const backdate = new Date(Date.now() - 3 * 60 * 1000);
  await models.MiningSession.updateOne(
    { userId: user.id },
    { $set: { startedAt: backdate, lastClaimAt: backdate } }
  );
  const idempotencyKey = key();
  const sendClaim = () => api().post("/api/mining/claim").set(auth(user.token))
    .set("Idempotency-Key", idempotencyKey).send({});
  const [first, duplicate] = await Promise.all([sendClaim(), sendClaim()]);
  expect([first.status, duplicate.status].sort()).toEqual([200, 201]);
  expect(first.body.claim.amount).toBe(30);
  expect(duplicate.body.claim.claimId).toBe(first.body.claim.claimId);
  expect(await getVes(user)).toBe(30);
  const tx = await api().get("/api/wallet/transactions?limit=50").set(auth(user.token));
  expect(tx.body.transactions.filter((item) => item.source === "MINING_REWARD")).toHaveLength(1);
});

test("number-guess game hides the answer and credits a winning guess once", async () => {
  const user = await makeUser();
  const config = await api().get("/api/games/config").set(auth(user.token));
  expect(config.status).toBe(200);
  expect(config.body.games[0]).toMatchObject({ gameType: "number_guess", minNumber: 1, maxNumber: 5, rewardVes: 25 });
  expect(config.body.numberGuess).toMatchObject({ dailyLimit: 3, playsUsed: 0, playsRemaining: 3 });
  expect(config.body.numberGuess.resetsAt).toBeTruthy();

  const idempotencyKey = key();
  const create = () => api().post("/api/games/challenges").set(auth(user.token))
    .set("Idempotency-Key", idempotencyKey).send({});
  const [created, duplicate] = await Promise.all([create(), create()]);
  expect([created.status, duplicate.status].sort()).toEqual([200, 201]);
  expect(created.body.challenge.challengeId).toBe(duplicate.body.challenge.challengeId);
  expect(created.body.daily).toMatchObject({ playsUsed: 1, playsRemaining: 2 });
  expect(created.body.challenge).not.toHaveProperty("targetNumber");

  const challenge = await models.GameChallenge.findOne({ challengeId: created.body.challenge.challengeId }).select("+targetNumber");
  const guessKey = key();
  const sendGuess = () => api().post(`/api/games/challenges/${challenge.challengeId}/guess`)
    .set(auth(user.token)).set("Idempotency-Key", guessKey).send({ guess: challenge.targetNumber });
  const [won, repeated] = await Promise.all([sendGuess(), sendGuess()]);
  expect([won.status, repeated.status].sort()).toEqual([200, 200]);
  expect(won.body.attempt).toMatchObject({ correct: true, status: "WON", rewardAmount: 25 });
  expect(won.body.attempt.hint).toBeUndefined();
  expect(repeated.body.challenge.challengeId).toBe(challenge.challengeId);
  expect(await getVes(user)).toBe(25);
  const tx = await api().get("/api/wallet/transactions?limit=50").set(auth(user.token));
  expect(tx.body.transactions.filter((item) => item.source === "GAME_REWARD")).toHaveLength(1);
});

test("number-guess allows only 3 challenge starts per UTC day and preserves idempotent retries", async () => {
  const user = await makeUser();
  const created = [];
  let firstKey;

  for (let index = 0; index < 3; index += 1) {
    const idempotencyKey = key();
    if (index === 0) firstKey = idempotencyKey;
    const response = await api().post("/api/games/challenges").set(auth(user.token))
      .set("Idempotency-Key", idempotencyKey).send({});
    expect(response.status).toBe(201);
    expect(response.body.daily.playsUsed).toBe(index + 1);
    expect(response.body.daily.playsRemaining).toBe(2 - index);
    created.push(response.body.challenge.challengeId);
  }

  const retry = await api().post("/api/games/challenges").set(auth(user.token))
    .set("Idempotency-Key", firstKey).send({});
  expect(retry.status).toBe(200);
  expect(retry.body.challenge.challengeId).toBe(created[0]);
  expect(retry.body.daily).toMatchObject({ playsUsed: 3, playsRemaining: 0 });

  const overLimit = await api().post("/api/games/challenges").set(auth(user.token))
    .set("Idempotency-Key", key()).send({});
  expect(overLimit.status).toBe(429);
  expect(overLimit.body.code).toBe("DAILY_GAME_LIMIT");
});

test("game challenges reject invalid guesses and end after configured failed attempts", async () => {
  const user = await makeUser();
  const challengeResponse = await api().post("/api/games/challenges").set(auth(user.token))
    .set("Idempotency-Key", key()).send({});
  const challengeId = challengeResponse.body.challenge.challengeId;
  const challenge = await models.GameChallenge.findOne({ challengeId }).select("+targetNumber");
  const wrongGuess = challenge.targetNumber === 1 ? 2 : 1;
  const invalid = await api().post(`/api/games/challenges/${challengeId}/guess`)
    .set(auth(user.token)).set("Idempotency-Key", key()).send({ guess: 6 });
  expect(invalid.status).toBe(400);

  let finalResponse;
  for (let attempt = 0; attempt < challenge.maxAttempts; attempt += 1) {
    finalResponse = await api().post(`/api/games/challenges/${challengeId}/guess`)
      .set(auth(user.token)).set("Idempotency-Key", key()).send({ guess: wrongGuess });
    expect(finalResponse.status).toBe(200);
    expect(finalResponse.body.attempt.hint).toBe(wrongGuess < challenge.targetNumber ? "HIGHER" : "LOWER");
    expect(finalResponse.body.challenge.guesses[attempt].hint).toBe(finalResponse.body.attempt.hint);
  }
  expect(finalResponse.body.challenge.status).toBe("LOST");
  expect(finalResponse.body.challenge.targetNumber).toBe(challenge.targetNumber);
  expect(await getVes(user)).toBe(0);
});

test("stone paper scissors gives 5 UTC-day plays, rewards wins once, and blocks extra rounds", async () => {
  const user = await makeUser();
  const config = await api().get("/api/games/config").set(auth(user.token));
  expect(config.status).toBe(200);
  expect(config.body.stonePaperScissors).toMatchObject({
    dailyLimit: 5,
    playsUsed: 0,
    playsRemaining: 5,
    rewardVes: 30,
  });
  expect(config.body.stonePaperScissors.resetsAt).toBeTruthy();
  const invalidChoice = await api().post("/api/games/stone-paper-scissors/play")
    .set(auth(user.token)).set("Idempotency-Key", key()).send({ choice: "lizard" });
  expect(invalidChoice.status).toBe(400);

  const playResults = [];
  let firstPlayKey;
  for (let index = 0; index < 5; index += 1) {
    const idempotencyKey = key();
    if (index === 0) firstPlayKey = idempotencyKey;
    const response = await api().post("/api/games/stone-paper-scissors/play")
      .set(auth(user.token)).set("Idempotency-Key", idempotencyKey).send({ choice: "rock" });
    expect(response.status).toBe(201);
    expect(["WIN", "TIE", "LOSS"]).toContain(response.body.play.outcome);
    expect(response.body.play.rewardAmount).toBe(response.body.play.outcome === "WIN" ? 30 : 0);
    expect(response.body.daily.playsUsed).toBe(index + 1);
    expect(response.body.daily.playsRemaining).toBe(4 - index);
    playResults.push(response.body.play);
  }

  const replay = () => api().post("/api/games/stone-paper-scissors/play")
    .set(auth(user.token)).set("Idempotency-Key", firstPlayKey).send({ choice: "rock" });
  const [first, duplicate] = await Promise.all([replay(), replay()]);
  expect([first.status, duplicate.status]).toEqual([200, 200]);
  expect(first.body.play.playId).toBe(duplicate.body.play.playId);
  expect(first.body.daily.playsUsed).toBe(5);

  const overLimit = await api().post("/api/games/stone-paper-scissors/play")
    .set(auth(user.token)).set("Idempotency-Key", key()).send({ choice: "scissors" });
  expect(overLimit.status).toBe(429);
  expect(overLimit.body.code).toBe("DAILY_GAME_LIMIT");

  const totalWon = playResults.reduce((sum, play) => sum + play.rewardAmount, 0);
  expect(await getVes(user)).toBe(totalWon);
  const tx = await api().get("/api/wallet/transactions?limit=50").set(auth(user.token));
  expect(tx.body.transactions.filter((item) => item.source === "GAME_REWARD")).toHaveLength(totalWon / 30);
});

test("10. ledger reconciliation: every wallet equals credits - debits", async () => {
  const report = await svc.recon.reconcileAll();
  expect(report.mismatches).toEqual([]);
  expect(report.ok).toBe(true);
});

test("ledger records cannot be modified", async () => {
  const u = await makeUser(100);
  await expect(models.Tx.updateOne({ userId: u.id }, { $set: { amount: 999999 } })).rejects.toThrow(/immutable/);
});
