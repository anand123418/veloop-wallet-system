# VELoop Rewards Wallet System (Backend)

Backend-driven wallet, ledger and withdrawal system. The backend owns all money logic; the React app only displays data.

**Technologies:** Node.js, Express.js, MongoDB, Mongoose, JWT, and Joi. The React/Vite frontend is maintained separately in `veloop-frontend/frontend`.

## Setup
```bash
git clone <your-repo-url>
cd backend
npm install
cp .env.example .env        # then fill in MONGO_URI and JWT_SECRET
npm run seed                # payout options + demo users + demo wallet
npm run dev                 # http://localhost:5000
```
**Database:** use your own free MongoDB Atlas cluster. Transactions need a replica set, and Atlas is one. A plain local `mongod` will not work unless started as a replica set.
Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Demo logins (demo data only):** `demo@veloop.test / Demo@12345` and `admin@veloop.test / Admin@12345`.
`npm run seed:reset` wipes and re-creates the demo accounts.

## Folder structure
```
src/config       env + database connection
src/models       User, Wallet, WalletTransaction (ledger), Exchange/Rate, Referral, Spin, Mining, GameChallenge, NumberGuessDailyQuota, RpsDailyQuota/RpsPlay, PayoutMethod/Option, Withdrawal, AuditLog
src/services     walletService, exchangeService, referralService, spinService, miningService, gameService, rpsService, payoutService, withdrawalService, authService, auditService, reconciliationService
src/controllers  thin HTTP layer
src/routes       URL -> middleware -> controller (including exchanges, referrals and spin)
src/middleware   auth, rate limits, validation, error handler
src/validators   Joi schemas
seed/            payout configuration + demo data
scripts/         reconcile.js
tests/           Jest + Supertest
```
Daily rewards, referral signup rewards, exchanges, spin, mining, and games reuse `walletService`. Exchange debit/credit and spin/game/mining rewards are committed with their operation records in MongoDB transactions. Referral rewards are issued once during a referred user's signup. All earned and spent wallet amounts are recorded in the append-only wallet ledger.

Exchange rates and spin prizes are database-backed, seeded as demo values in `seed/walletFeatures.js`. Seed defaults only apply when a rate/prize row is first created. Referral signup rewards default to 500 VEs and can be set with `REFERRAL_REWARD_VES`. These demo exchange rates and prize odds are not production rates; configure and review them before deployment.

Mining, games, and demo rewarded ads use the defaults documented in `.env.example`. Mining awards whole-minute VEs on claim and caps each session at eight hours. Number Guess hides a server-generated answer, allows three configured guesses per challenge and three challenge starts per UTC day, expires each challenge after ten minutes, and awards 25 VEs by default for a correct answer. Stone Paper Scissors is a single-player game against a server-selected move, with five rounds per UTC day and 30 VEs per win. The separate simulated ad-reward API enforces a server-side wait and daily claim cap but does not verify actual ad impressions. Short animated previews shown before daily-reward claims, exchange confirmations, spins, mining claims, and game-round completion are frontend-only gates, not server-verified advertising. Production ads require a verified ad-provider callback. All reward and game rules are for demonstration only.

## Database architecture
- **Wallet:** one document per user with integer balances (`ves, sves, gems, tokens, spins`). Never negative.
- **WalletTransaction (ledger):** one append-only row per balance change: `type CREDIT/DEBIT`, `amount`, `balanceBefore`, `balanceAfter`, `source`, `referenceId`. The model blocks update and delete. A unique index on `(userId, currency, source, referenceId)` makes replays and double refunds impossible.
- **Reconciliation:** `wallet balance = 0 + credits − debits` for every currency. Check with `npm run reconcile` or `GET /api/admin/reconcile/:userId`.
- **PayoutMethod / PayoutOption:** what each method asks for and what each option costs. Change prices in the database, no frontend rebuild.
- **ExchangeRate:** server-owned, integer conversion rates; users can exchange VEs to SVEs, Gems, Tokens, or Spins.
- **Exchange:** records the idempotent exchange and links the debit and credit ledger entries.
- **Referral:** records each referred signup and the inviter's one-time VEs reward. Referral codes are unique per user.
- **SpinPrize / SpinPlay:** configurable weighted prizes and idempotent play records. The server chooses from the configured odds; each play costs one Spin.
- **MiningSession / MiningClaim:** server-timed mining sessions and idempotent reward claims. Clients cannot choose the elapsed time or reward amount.
- **GameChallenge:** server-generated hidden-number challenges with bounded attempts, expiration, and a single ledger-backed reward.
- **RpsDailyQuota / RpsPlay:** atomic per-user daily round limits and idempotent server-resolved Stone Paper Scissors outcomes; winning rewards use the wallet ledger.
- **AdRewardSession / AdRewardDailyQuota:** server-timed demo ad reward sessions, per-user daily claim limits, and atomic ledger credits.
- **Withdrawal:** request record with status history, linked to its ledger debit (`transactionId`) and refund (`refundTransactionId`).
- **AuditLog:** append-only record of withdrawal events, admin wallet changes, balance corrections and payout config changes.
- **Indexes:** `userId+createdAt`, `transactionId`, `withdrawalId`, `referenceId`, `status+createdAt`, unique `(userId, idempotencyKey)`.

## Balance strategy (documented choice)
**Option A: deduct immediately.** Creating a withdrawal debits VEs and writes a ledger entry in the same database transaction. REJECTED or CANCELLED returns the VEs with a `WITHDRAWAL_REFUND` credit. APPROVED needs no wallet change.

## Security
- **Authentication:** JWT, verified on every request. The user record is reloaded each time so bans apply immediately.
- **Authorization:** the wallet owner is always `req.user.id`. `?userId=` for another user returns 403. Credit/debit and `/admin/*` need role `admin`. Another user's withdrawal id returns 404.
- **Validation:** Joi on every body and query. Unknown fields are stripped. The withdrawal body has no amount at all. Payout details are checked against patterns stored in the database.
- **Atomic operations:** a debit is one `findOneAndUpdate` whose filter includes `balance >= amount`, so two parallel requests cannot spend the same balance. Debit + ledger + withdrawal + audit run in one MongoDB transaction; any failure rolls everything back.
- **Idempotency:** withdrawal, exchange, spin, mining-claim, game, and demo ad-reward mutations accept idempotency keys and return prior results on retries. Unique database constraints protect the corresponding operations; referral rewards are unique per referred user.
- **Rate limiting:** login/register 10 per 15 min, withdrawals 5 per minute per user, admin writes 30 per minute, general 120 per minute. (In-memory; use a Redis store with several servers.)
- **Proxy handling:** client IPs are not trusted by default. Set `TRUST_PROXY` to the exact number of trusted reverse-proxy hops only when deployed behind those proxies.
- **Other:** helmet, CORS limited to `CLIENT_URL`, `express-mongo-sanitize`, 10 KB body limit, generic error messages (database errors are never shown), a simple fraud rule (max withdrawals per 24 h, suspended accounts blocked).

## How an evaluator can test
Import `postman/VELoop_Wallet.postman_collection.json`, set `baseUrl`, run **Login (user)** then:
1. **Credit / Debit:** run **Login (admin)**, then **Admin credit** and **Admin debit**. Check the wallet and transactions.
2. **Withdrawal:** **Create withdrawal (UPI ₹100)** → wallet drops by 19,500 and a pending withdrawal appears.
3. **Insufficient balance:** run it repeatedly until the balance is too low, or use **Withdraw ₹1000** with the demo user.
4. **Duplicate:** send **Create withdrawal** twice with the same `Idempotency-Key` (use the fixed-key request). Only one debit happens.
5. **Payout selection:** **Payout methods** and **Payout options (UPI)**.
6. **Daily reward:** **Claim daily reward** twice. The first returns 201 (+100 VEs by default), the second returns 409. The daily boundary is IST.
7. **Reject/refund:** admin **Reject withdrawal** returns the VEs once; a second reject returns 409.
8. **Exchange:** register/login, fetch `/api/exchanges/rates`, exchange a multiple of the advertised VEs rate, then verify both ledger entries and retry with the same idempotency key.
9. **Referrals:** register a second user with the first user's referral code; verify the inviter receives one configured referral credit and `/api/referrals` reflects it.
10. **Spin:** add spins to a test wallet, fetch `/api/spin/prizes`, play once, and verify the spin debit and any server-selected prize credit.
11. **Mining:** start a session, wait at least the configured whole-minute/cooldown interval, claim with an idempotency key, then verify the server-calculated mining credit in wallet history.
12. **Number Guess:** check `/api/games/config`, start up to three challenges in a UTC day, and verify a fourth distinct start returns 429. Each challenge has its own configured guess limit; a win pays at most once.
13. **Stone Paper Scissors:** play up to five rounds in a UTC day; verify the server resolves each round and rejects an additional round.
14. **Demo ad reward:** start a session, wait for the configured server timer, then claim and check the daily quota. This is simulated and does not verify an ad impression.

The Postman collection includes requests for daily and demo-ad rewards, exchange, referrals, spin, mining, games, and withdrawals.

Automated tests: `npm test` runs Jest integration tests covering wallet credit/debit, withdrawals, insufficient balance, idempotency, concurrent withdrawals, payout validation, ownership, refunds, API manipulation, daily and demo-ad rewards, referrals, exchange, spin, mining, both games and their daily limits, reconciliation, and ledger immutability. They use an in-memory MongoDB replica set (the first run may download the MongoDB binary). See `TEST_RESULTS.md`.

## Production considerations

The following are recommendations for a production deployment, not features currently implemented:
- **Atomic updates and transactions:** keep the conditional `$inc` + ledger insert. For hot wallets, keep transactions short and retry transient errors.
- **Ledger:** keep it append-only and partition it (shard by `userId`, archive old months). Store periodic balance snapshots so reconciliation reads only recent rows.
- **Idempotency:** keep the unique-key approach and add key expiry, plus idempotency for every internal caller (ads, games, referrals) through `referenceId`.
- **Indexing:** review slow queries, use covered indexes, avoid deep `skip` pagination (use cursor pagination on `createdAt/_id`).
- **Queues:** move payout delivery (UPI/gift-card providers) to a worker queue (BullMQ/Kafka) with retries and a dead-letter queue; the API only records the request.
- **Caching:** cache read-only data (payout options) in Redis. Never cache the balance as the source of truth.
- **Rate limiting:** move to Redis-backed limits per user, IP and device.
- **Fraud detection:** velocity rules, device/IP clustering, referral-abuse detection, risk scores that route withdrawals to manual review.
- **Audit logs and reconciliation:** scheduled reconciliation jobs, alerts on any mismatch, immutable (WORM) audit storage.
- **Monitoring and scale:** metrics and alerts (error rate, transaction latency, queue depth, pending-withdrawal age), read replicas for history, horizontal API scaling behind a load balancer.

## Deploy

Deploy the backend on a Node.js host and the frontend separately on a static hosting service; use MongoDB Atlas or another MongoDB replica set because wallet transactions require transaction support. Set `MONGO_URI`, a random `JWT_SECRET` of at least 32 characters, and `CLIENT_URL` (the allowed frontend origin) in the backend environment. Set `VITE_API_URL` (including `/api`) in the frontend build environment. Never commit `.env` files.


