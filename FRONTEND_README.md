# VELoop Wallet Frontend

React 18 single-page demo for the VELoop wallet. It uses React Router and Vite; the backend remains the source of truth for balances, exchange rates, prizes, game outcomes, mining claims, and withdrawals.

## Requirements and setup

- Node.js 18 or newer
- The VELoop backend running at `http://localhost:5000` (or configure another API URL)

From this directory:

```bash
npm install
npm run dev
```

The development server is normally available at `http://localhost:5173`. Copy `.env.example` to `.env` and set `VITE_API_URL` if the backend is hosted elsewhere. It defaults to `http://localhost:5000/api`. Configure the backend `CLIENT_URL` to allow the frontend origin.

On Windows PowerShell, copy the example with:

```powershell
Copy-Item .env.example .env
```

Production commands:

```bash
npm run build
npm run preview
```

## Pages and features

- `/login` and `/register`: account access; registration accepts an optional referral code through `?ref=CODE`.
- `/wallet`: balances, paginated transaction history, daily reward, and the separate simulated ad-reward claim flow.
- `/payout`: choose a method and option, enter payout details, review, and submit a withdrawal.
- `/features?tab=exchange|referrals|spin|mining|games`: shared feature page. The tab defaults to Exchange if it is missing or invalid.
- `/exchange`, `/referrals`, `/spin`, `/mining`, and `/games`: legacy URLs that redirect to the corresponding Features tab.

The UI is responsive and includes keyboard focus indicators, skip navigation, live status/error announcements, and keyboard-managed dialogs.

The demo ad is an animated preview, not a video ad or a verified impression. A short client-side preview appears before daily reward claims, exchange confirmations, spins, mining claims, and Number Guess / Stone Paper Scissors round completion. These UI gates do not verify ad viewing on the backend. The wallet's separate **Watch demo ad** reward flow does use a server-enforced timer and daily quota, but it also does not verify an actual ad impression.

All reward amounts, odds, and game limits are demonstration settings and must not be treated as VELoop production rules.

## Backend API

The frontend API client is `src/api.js`. The backend is authoritative for wallet balances, reward amounts, exchange rates, game outcomes, mining accrual, payout costs, and withdrawal status.

Set `VITE_API_URL` to the backend API base URL, including `/api`. The default is:

```text
http://localhost:5000/api
```

For example:

```env
VITE_API_URL=https://api.example.com/api
```

The browser must be allowed by the backend's CORS configuration. The frontend sends JSON requests and expects JSON responses.

### Authentication and errors

Registration and login are public. All other calls require the JWT returned by login or registration. The frontend stores that token in browser `localStorage` under `veloop_token` and sends it as:

```http
Authorization: Bearer <JWT>
```

On an HTTP `401`, the API client clears the saved token and signs the user out. For other unsuccessful HTTP responses, or a JSON response with `"success": false`, it throws an error using the response's `message` when available. If the server cannot be reached, the frontend reports a connection error. The frontend does not currently use backend error `code` fields.

New mutating actions generate an idempotency key with `crypto.randomUUID()` where the API requires one. Retries of the same logical operation should reuse its original key; a distinct operation should use a new key.

### Endpoints used by the frontend

`{baseUrl}` below means the configured `VITE_API_URL`.

#### Authentication

| Method and path | Request body | Response fields used by the frontend |
|---|---|---|
| `POST {baseUrl}/auth/register` | `{ "email": "user@example.com", "name": "Name", "password": "at-least-8-characters", "referralCode": "optional" }` | `token`, optional `user` |
| `POST {baseUrl}/auth/login` | `{ "email": "user@example.com", "password": "..." }` | `token`, optional `user` |

`referralCode` is omitted when blank. On success, the frontend saves the token and navigates to `/wallet`.

#### Wallet and rewards

| Method and path | Request | Response fields used by the frontend |
|---|---|---|
| `GET {baseUrl}/wallet` | — | `wallet.ves`, `wallet.sves`, `wallet.gems`, `wallet.tokens`, `wallet.spins` |
| `GET {baseUrl}/wallet/transactions?page={page}&limit={limit}` | Defaults to `page=1`, `limit=10` | `transactions[]` (`transactionId`, `type`, `currency`, `amount`, `balanceAfter`, `source`, `status`, `description`, `createdAt`), `totalPages` |
| `GET {baseUrl}/rewards/daily` | — | `claimed`, `amount` |
| `POST {baseUrl}/rewards/daily/claim` | Empty JSON body | `message`, updated `wallet` |
| `GET {baseUrl}/rewards/ad` | — | `amount`, `dailyLimit`, `claimsUsed`, `claimsRemaining`, `watchDurationSeconds`, `resetsAt`, `activeSession` |
| `POST {baseUrl}/rewards/ad/start` | Empty JSON body; `Idempotency-Key` required | `amount`, quota fields above, `activeSession` |
| `POST {baseUrl}/rewards/ad/{sessionId}/claim` | Empty JSON body; `Idempotency-Key` required | `message`, updated `wallet`, `amount`, quota fields above, `activeSession` |

The transaction history is requested in pages of 10. Transaction fields shown in the UI include the amount and resulting balance, but not every field returned by the backend.

The rewarded-ad endpoints are simulated. The backend enforces its session timer and quota, but neither backend nor frontend verifies a real ad impression. The animated previews shown before selected actions are frontend-only gates and do not call an ad-provider API.

#### Exchange, referrals, spin, and mining

| Method and path | Request | Response fields used by the frontend |
|---|---|---|
| `GET {baseUrl}/exchanges/rates` | — | `rates[]` (`rateId`, `toCurrency`, `fromAmount`, `toAmount`) |
| `POST {baseUrl}/exchanges` | `{"toCurrency":"tokens","amount":500}`; `Idempotency-Key` required | `wallet`, `message` |
| `GET {baseUrl}/referrals` | — | `referralCode`, `rewardPerSignup`, `totalReferrals`, `earnedVes`, `referrals[]` (`referralId`, `createdAt`, `status`, `rewardAmount`) |
| `GET {baseUrl}/spin/prizes` | — | `spinCost`, `prizes[]` (`prizeId`, `name`, `currency`, `amount`, `chancePercent`) |
| `POST {baseUrl}/spin/play` | Empty JSON body; `Idempotency-Key` required | Updated `wallet`, `spin` (`spinId`, `prizeName`, `rewardCurrency`, `rewardAmount`, `createdAt`) |
| `GET {baseUrl}/mining/status` | — | `mining` (`active`, `startedAt`, `rateVesPerMinute`, `claimableVes`, `maxDurationHours`, `canClaim`, `sessionComplete`, `cooldownRemainingSeconds`) |
| `POST {baseUrl}/mining/start` | Empty JSON body | `mining`, `message` |
| `POST {baseUrl}/mining/claim` | Empty JSON body; `Idempotency-Key` required | Updated `mining`, `message` |

The exchange form displays a preview based on rates returned by the server, but the backend must validate the current rate and balance when the exchange is submitted. Mining status is polled every five seconds while the page is open. The browser does not submit a mining reward amount; the backend calculates it.

#### Games

| Method and path | Request | Response fields used by the frontend |
|---|---|---|
| `GET {baseUrl}/games/config` | — | `games[0]`; `numberGuess` quota (`playsRemaining`, `dailyLimit`, `resetsAt`); `stonePaperScissors` quota (`playsRemaining`, `playsUsed`, `dailyLimit`, `rewardVes`, `resetsAt`, `recentPlays[]`) |
| `POST {baseUrl}/games/challenges` | Empty JSON body; `Idempotency-Key` required | `challenge` (including `challengeId`, `status`, number range, attempts and expiry), `daily` quota |
| `POST {baseUrl}/games/challenges/{challengeId}/guess` | `{"guess":3}`; `Idempotency-Key` required | Updated `challenge`, `attempt` (`status`, `correct`, `hint`, `attemptsRemaining`, `rewardAmount`) |
| `POST {baseUrl}/games/stone-paper-scissors/play` | `{"choice":"rock"}` where choice is `rock`, `paper`, or `scissors`; `Idempotency-Key` required | Updated `daily` quota, `play` (`playId`, `playerChoice`, `opponentChoice`, `outcome`, `rewardAmount`) |

Number Guess challenge starts and guesses use separate idempotency keys. The frontend reads the configured daily limits and game rules from the backend; the backend decides the hidden number, result, quota, and any reward. Stone Paper Scissors' opponent choice and result are also server-selected.

#### Payout and withdrawal

| Method and path | Request | Response fields used by the frontend |
|---|---|---|
| `GET {baseUrl}/payout/methods` | — | `methods[]` (`method`, `name`, optional `fields[]`) |
| `GET {baseUrl}/payout/options/{method}` | Method identifier from the methods response | `options[]` (`optionId`, `payoutValue`, `requiredAmount`, optional `active`, `eligible`) |
| `POST {baseUrl}/withdrawals` | See body below; `Idempotency-Key` required | `withdrawal` (`withdrawalId`, `status`) |

Withdrawal request:

```json
{
  "method": "upi",
  "optionId": "upi_100",
  "payoutDetails": {
    "upiId": "name@bank"
  }
}
```

The frontend deliberately does **not** send a withdrawal amount or VE cost. It submits the selected method and option identifiers plus payout details; the backend looks up the option, validates the request and balance, determines the cost, and returns the withdrawal record. The success view displays the selected option's payout value and the returned withdrawal status/reference.

### Idempotency-key usage

The frontend sends `Idempotency-Key` on:

- Starting and claiming a simulated ad reward
- Exchanges and spins
- Mining claims
- Number Guess challenge starts and guesses
- Stone Paper Scissors plays
- Withdrawal submissions

It does not send an idempotency key for daily reward claims or mining starts. Follow the backend's key format and length requirements. A retry of the same logical operation should reuse its original key; a distinct operation should use a new key.

### API reference scope

This section documents only endpoints called by this frontend; it does not document backend-only administration endpoints. For complete server-side request schemas, validation rules, error cases, and configuration, see `../backend/API_DOCUMENTATION.md`.

## Demo account

The backend seed creates `demo@veloop.test` and `admin@veloop.test`. Passwords are controlled by the backend's `DEMO_PASSWORD` and `ADMIN_PASSWORD` environment variables; see the backend README before using seeded accounts.