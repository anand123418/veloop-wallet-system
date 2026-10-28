// Single place for all backend calls. Only the JWT is stored client-side.
// Wallet balances are NEVER stored in the browser.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "veloop_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (res.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new Event("veloop:unauthorized"));
  }
  if (!res.ok || data?.success === false) {
    throw new ApiError(data?.message || "Something went wrong. Please try again.", res.status);
  }
  return data;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  register: (email, name, password, referralCode) =>
    request("/auth/register", {
      method: "POST",
      body: { email, name, password, ...(referralCode ? { referralCode } : {}) },
    }),
  getWallet: () => request("/wallet"),
  getTransactions: (page = 1, limit = 10) => request(`/wallet/transactions?page=${page}&limit=${limit}`),
  getDaily: () => request("/rewards/daily"),
  claimDaily: () => request("/rewards/daily/claim", { method: "POST" }),
  getAdReward: () => request("/rewards/ad"),
  startAdReward: (idempotencyKey) =>
    request("/rewards/ad/start", { method: "POST", body: {}, headers: { "Idempotency-Key": idempotencyKey } }),
  claimAdReward: (sessionId, idempotencyKey) =>
    request(`/rewards/ad/${encodeURIComponent(sessionId)}/claim`, {
      method: "POST",
      body: {},
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  getExchangeRates: () => request("/exchanges/rates"),
  exchange: ({ toCurrency, amount }, idempotencyKey) =>
    request("/exchanges", {
      method: "POST",
      body: { toCurrency, amount },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  getReferrals: () => request("/referrals"),
  getSpinPrizes: () => request("/spin/prizes"),
  playSpin: (idempotencyKey) =>
    request("/spin/play", { method: "POST", body: {}, headers: { "Idempotency-Key": idempotencyKey } }),
  getMiningStatus: () => request("/mining/status"),
  startMining: () => request("/mining/start", { method: "POST", body: {} }),
  claimMining: (idempotencyKey) =>
    request("/mining/claim", { method: "POST", body: {}, headers: { "Idempotency-Key": idempotencyKey } }),
  getGames: () => request("/games/config"),
  createGameChallenge: (idempotencyKey) =>
    request("/games/challenges", { method: "POST", body: {}, headers: { "Idempotency-Key": idempotencyKey } }),
  submitGameGuess: (challengeId, guess, idempotencyKey) =>
    request(`/games/challenges/${encodeURIComponent(challengeId)}/guess`, {
      method: "POST",
      body: { guess },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  playStonePaperScissors: (choice, idempotencyKey) =>
    request("/games/stone-paper-scissors/play", {
      method: "POST",
      body: { choice },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  getMethods: () => request("/payout/methods"),
  getOptions: (method) => request(`/payout/options/${encodeURIComponent(method)}`),
  // Note: NO amount is sent. The backend looks the option up and decides the cost.
  createWithdrawal: ({ method, optionId, payoutDetails }, idempotencyKey) =>
    request("/withdrawals", {
      method: "POST",
      body: { method, optionId, payoutDetails },
      headers: { "Idempotency-Key": idempotencyKey },
    }),
};
