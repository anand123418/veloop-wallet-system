# API Documentation

Base URL: `http://localhost:5000/api`
All responses are JSON. Success: `{ "success": true, ... }`. Failure: `{ "success": false, "message": "...", "code": "..." }`.
Protected routes need the header `Authorization: Bearer <JWT>`. The user is always taken from the token, never from the request.

## Auth
| Endpoint | Method | Auth | Request | Success response |
|---|---|---|---|---|
| `/auth/register` | POST | none | `{ email, name, password, referralCode? }` (password 8 to 72 chars) | 201 `{ token, user }` |
| `/auth/login` | POST | none | `{ email, password }` | 200 `{ token, user }` |

Errors: 400 validation, 401 `Invalid email or password.`, 409 `An account with this email already exists.`, 429 rate limited (10 per 15 min).
Registration returns a unique `user.referralCode`. An optional valid `referralCode` credits the inviter once in the same transaction as account and wallet creation.

## Wallet
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/wallet` | GET | user | Own wallet |
| `/wallet/transactions?page=1&limit=20&currency=ves` | GET | user | Own ledger, newest first. `limit` max 50 |
| `/wallet/summary` | GET | user | Wallet + 5 latest transactions + pending withdrawal count |
| `/wallet/credit` | POST | **admin** | Add balance to a user |
| `/wallet/debit` | POST | **admin** | Remove balance from a user |

```json
GET /api/wallet
{ "success": true, "wallet": { "ves": 25000, "sves": 5000, "gems": 100, "tokens": 500, "spins": 3 } }
```
```json
GET /api/wallet/transactions?page=1&limit=10
{ "success": true, "page": 1, "limit": 10, "total": 11, "totalPages": 2,
  "transactions": [ { "transactionId": "txn_...", "type": "DEBIT", "currency": "ves", "amount": 2400,
    "balanceBefore": 27400, "balanceAfter": 25000, "source": "WITHDRAWAL", "referenceId": "wd_...",
    "status": "COMPLETED", "description": "UPI withdrawal (₹10)", "createdAt": "..." } ] }
```
**Credit / debit request** (admin token): `{ "userId": "<24 hex>", "currency": "ves", "amount": 500, "source": "ADMIN_CREDIT", "referenceId": "optional-unique", "description": "optional" }`
- Credit sources: `REWARD, BONUS, REFERRAL, DAILY_REWARD, AD_REWARD, GAME_REWARD, ADMIN_CREDIT, EXCHANGE_CREDIT, SPIN_REWARD`
- Debit sources: `EXCHANGE_DEBIT, ADMIN_DEBIT, CORRECTION, SPIN_PLAY`
- Currencies: `ves, sves, gems, tokens, spins`. Amount: whole number, 1 to 1,000,000,000.
- Re-sending the same `referenceId` for the same user/currency/source returns 409 (no double credit).

Errors: 401 `Authentication required.`, 403 `You can only access your own wallet.` (when `?userId=` is someone else), 403 `You do not have permission to do this.` (non-admin on credit/debit), 400 `Insufficient VEs balance.`

## Payout
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/payout/methods` | GET | user | Active methods and the details each one needs |
| `/payout/options/:method` | GET | user | Active options for `upi`, `amazon`, `google_play` |

```json
GET /api/payout/methods
{ "success": true, "methods": [ { "method": "upi", "name": "UPI",
  "fields": [ { "name": "upiId", "label": "UPI ID", "type": "text", "placeholder": "name@bank" } ] } ] }
```
```json
GET /api/payout/options/upi
{ "success": true, "options": [ { "optionId": "upi_100", "method": "upi", "currency": "ves",
  "requiredAmount": 19500, "payoutValue": 100, "payoutCurrency": "INR", "active": true, "eligible": true } ] }
```
Errors: 400 `This payout method is currently unavailable.`

## Rewards
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/rewards/daily` | GET | user | Whether today's reward is claimed |
| `/rewards/daily/claim` | POST | user | Claim today's reward (+100 VEs by default, set by `DAILY_REWARD_VES`) |
| `/rewards/ad` | GET | user | Ad reward amount, daily claim allowance, reset time and active session |
| `/rewards/ad/start` | POST | user | Start a demo rewarded-ad session (requires `Idempotency-Key`) |
| `/rewards/ad/:sessionId/claim` | POST | user | Claim after the server-enforced watch duration (requires `Idempotency-Key`) |

```json
GET /api/rewards/daily
{ "success": true, "claimed": false, "amount": 100, "nextClaimAt": "2026-10-27T18:30:00.000Z" }

POST /api/rewards/daily/claim
201 { "success": true, "message": "Daily reward claimed: +100 VEs.", "amount": 100, "wallet": { "ves": 25100, ... }, "transaction": { ... } }
```
One claim per user per day (India time, IST). The amount is decided by the server. Errors: 401 `Authentication required.`, 409 `You have already claimed today's reward. Come back tomorrow.`

The demo rewarded-ad flow is simulated and does **not** verify an actual ad impression. Starting an ad creates a server-side session; the reward endpoint rejects claims until the configured minimum watch duration has passed. A user can claim at most the configured number of rewards per IST day. The quota update, session completion, and ledger credit are atomic and idempotent.

| Variable | Default | Description |
|---|---:|---|
| `AD_REWARD_VES` | `25` | VEs awarded per completed demo ad |
| `AD_REWARD_DAILY_LIMIT` | `5` | Maximum ad rewards per user per IST day |
| `AD_WATCH_DURATION_SECONDS` | `15` | Server-enforced minimum session duration (1–300 seconds) |

For production ads, connect a rewarded-ad provider and verify its server-side callback/signature; the demo timer is not proof of an impression.

## Exchanges
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/exchanges/rates` | GET | user | Active server-configured VEs conversion rates |
| `/exchanges` | POST | user | Exchange VEs for another wallet currency |

```json
GET /api/exchanges/rates
{ "success": true, "rates": [
  { "rateId": "ves_tokens", "fromCurrency": "ves", "fromAmount": 20, "toCurrency": "tokens", "toAmount": 1 }
] }

POST /api/exchanges        Header: Idempotency-Key: exchange-demo-001
{ "toCurrency": "tokens", "amount": 500 }
```
The response contains the exchange record and updated wallet. A successful exchange debits VEs and credits the target currency with two ledger entries inside one database transaction. Amounts must be exact multiples of the configured rate. Reusing an idempotency key returns the original exchange without applying it again.

The initial demo rates are stored in `seed/walletFeatures.js`: 100 VEs → 1 SVE, 250 VEs → 1 Gem, 20 VEs → 1 Token, and 1,000 VEs → 1 Spin. These are demo rates, not VELoop production rates. Seeded rows are insert-only so an operator's database changes are preserved on later seed runs.

The Postman collection includes requests for exchange rates and an idempotent exchange.

## Referrals
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/referrals` | GET | user | Personal referral code, signup count, earned VEs, and up to 50 recent referrals |

New users can supply an optional `referralCode` to `/auth/register`. A valid code rewards its active owner once per new signup. The default reward is 500 VEs and can be changed with `REFERRAL_REWARD_VES`. The referral reward and account/wallet creation commit together. The signup referred by the code receives no signup bonus.

## Spin
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/spin/prizes` | GET | user | Active prize list with reward amounts, server-calculated odds and spin cost |
| `/spin/play` | POST | user | Spend one spin and receive a server-selected prize |

```json
GET /api/spin/prizes
{ "success": true, "spinCost": 1, "spinCurrency": "spins", "prizes": [
  { "prizeId": "ves_10", "name": "10 VEs", "currency": "ves", "amount": 10, "chancePercent": 40 }
] }

POST /api/spin/play        Header: Idempotency-Key: spin-demo-001
{}
```
The server chooses the prize using configured weights, debits one spin, and records the result and ledger entries atomically. Reusing the same key returns the original result. Initial demo prizes include VEs, Gems, Tokens, an extra Spin and a no-prize outcome, including a rare 100 VE reward; weights are in `seed/walletFeatures.js`.

## Mining
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/mining/status` | GET | user | Current mining session, configured rate, claimable amount and cooldown |
| `/mining/start` | POST | user | Start a mining session |
| `/mining/claim` | POST | user | Claim elapsed mining rewards (requires `Idempotency-Key`) |

Mining accrues VEs on the server while a session is active. The server calculates the whole minutes earned; clients cannot submit a reward amount. Claims are credited to the append-only wallet ledger in a transaction with the mining session update. Duplicate keys do not pay twice. A session is capped and must be claimed before another can start.

Demo settings, configurable with backend environment variables:

| Variable | Default | Description |
|---|---:|---|
| `MINING_RATE_VES_PER_MINUTE` | `10` | VEs earned per whole mining minute |
| `MINING_CLAIM_INTERVAL_SECONDS` | `60` | Minimum time between claims |
| `MINING_MAX_DURATION_HOURS` | `8` | Maximum duration of one session |

## Games
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/games/config` | GET | user | Game rules, range, attempts and reward |
| `/games/challenges` | POST | user | Start a number-guess challenge (requires `Idempotency-Key`) |
| `/games/challenges/:challengeId/guess` | POST | user | Submit one guess (body `{ "guess": 3 }`, requires `Idempotency-Key`) |
| `/games/stone-paper-scissors/play` | POST | user | Play Rock Paper Scissors (body `{ "choice": "rock" }`, requires `Idempotency-Key`) |

The demo **Number Guess** challenge asks the user to guess a server-generated number from 1 to 5. The answer is hidden until the challenge ends; each incorrect guess returns a `hint` of `HIGHER` or `LOWER`, and each challenge allows a configured number of guesses before expiring after a configured time. Users may start up to three challenges per UTC day. The config response includes `numberGuess` daily usage and reset time; challenge creation returns the updated `daily` quota. A correct answer earns server-configured VEs, credited atomically with the challenge outcome. Attempts and rewards are idempotent, and completed challenges cannot pay twice.

| Variable | Default | Description |
|---|---:|---|
| `GAME_REWARD_VES` | `25` | VEs awarded for a correct answer |
| `GAME_MAX_ATTEMPTS` | `3` | Guesses allowed per challenge |
| `GAME_CHALLENGE_TTL_MINUTES` | `10` | Challenge expiry |

Mining and game values are configurable demo settings, not production reward rules.

**Stone Paper Scissors** is a single-player game against a server-selected opponent move. Each authenticated user gets five rounds per UTC day. Each round consumes one play; a win earns 30 VEs, while a tie or loss earns no reward. The server enforces the daily limit, selects the opponent move, resolves the outcome, and records the reward atomically. The daily play count and reset time are returned by `/games/config`.

## Withdrawals
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/withdrawals` | POST | user | Create a withdrawal. **Requires `Idempotency-Key` header** (8 to 64 chars, letters/digits/`-`/`_`) |
| `/withdrawals?page=1&limit=20` | GET | user | Own withdrawals |
| `/withdrawals/:id` | GET | user | One own withdrawal (`withdrawalId`) |
| `/withdrawals/:id/cancel` | POST | user | Cancel while `PENDING`; VEs are returned |

```json
POST /api/withdrawals        Header: Idempotency-Key: 6f1c...-uuid
{ "method": "upi", "optionId": "upi_100", "payoutDetails": { "upiId": "name@okbank" } }

201 { "success": true, "duplicate": false, "message": "Withdrawal submitted successfully.",
      "withdrawal": { "withdrawalId": "wd_...", "status": "PENDING", "currencyAmount": 19500, "payoutAmount": 100, ... },
      "wallet": { "ves": 5500, ... } }
```
There is **no amount field**. The server looks up `optionId` and decides the cost. Extra fields are ignored.
Sending the same `Idempotency-Key` again returns `200` with the original withdrawal and `duplicate: true`. No second debit.

Errors:
| Status | Message |
|---|---|
| 400 | `Insufficient VEs balance.` |
| 400 | `Selected payout option is unavailable.` |
| 400 | `This payout method is currently unavailable.` |
| 400 | `UPI ID is required.` / `Enter a valid UPI ID, for example name@bank.` |
| 400 | `A valid Idempotency-Key header is required.` |
| 401 | `Authentication required.` |
| 403 | `This request requires additional verification.` (suspended account or daily limit) |
| 404 | `Withdrawal not found.` (also returned for another user's id) |
| 409 | `This withdrawal can no longer be changed to CANCELLED.` |
| 429 | rate limit (5 per minute per user) |

**Status flow:** `PENDING → PROCESSING → APPROVED`, or `PENDING/PROCESSING → REJECTED`, or `PENDING → CANCELLED`. REJECTED and CANCELLED return the VEs through a `WITHDRAWAL_REFUND` ledger credit, exactly once.

## Admin (admin token required, every action is audited)
| Endpoint | Method | Body |
|---|---|---|
| `/admin/withdrawals?status=PENDING&page=1&limit=20` | GET | |
| `/admin/withdrawals/:id/processing` | PATCH | `{ note? }` |
| `/admin/withdrawals/:id/approve` | PATCH | `{ note? }` |
| `/admin/withdrawals/:id/reject` | PATCH | `{ reason, note? }` (reason required) |
| `/admin/payout-options/:optionId` | PATCH | any of `{ active, requiredAmount, payoutValue }` |
| `/admin/audit-logs?page=1&limit=20` | GET | |
| `/admin/reconcile/:userId` | GET | checks wallet == credits − debits; `userId` must be a 24-character MongoDB ID |

## Health
`GET /health` → `{ "success": true, "status": "ok" }`
