import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Loading, ErrorBox } from "../components/State.jsx";
import DemoAdPlayer from "../components/DemoAdPlayer.jsx";
import { useDemoAdGate } from "../components/useDemoAdGate.jsx";

const CURRENCIES = [
  { key: "ves", label: "VEs" },
  { key: "sves", label: "SVEs" },
  { key: "gems", label: "Gems" },
  { key: "tokens", label: "Tokens" },
  { key: "spins", label: "Spins" },
];
const PAGE_SIZE = 10;
const fmt = (n) => Number(n).toLocaleString("en-IN");
const fmtDate = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatSource = (source) =>
  String(source || "wallet activity").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const transactionIcon = (source, credit) => {
  if (source?.includes("AD_REWARD")) return "▶";
  if (source?.includes("WITHDRAWAL")) return "↗";
  if (source?.includes("EXCHANGE")) return "⇄";
  if (source?.includes("SPIN")) return "✳";
  if (source?.includes("MINING")) return "⌁";
  if (source?.includes("GAME")) return "◈";
  if (source?.includes("REFERRAL")) return "♧";
  return credit ? "＋" : "−";
};

export default function Wallet() {
  const navigate = useNavigate();
  const { requestDemoAd, demoAd } = useDemoAdGate();
  const [wallet, setWallet] = useState(null);
  const [tx, setTx] = useState({ items: [], totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState("");
  const [daily, setDaily] = useState(null);
  const [adReward, setAdReward] = useState(null);
  const [adError, setAdError] = useState("");
  const [adNotice, setAdNotice] = useState("");
  const [adBusy, setAdBusy] = useState(false);
  const [adNow, setAdNow] = useState(Date.now());
  const [adStartKey, setAdStartKey] = useState("");
  const [adClaimKey, setAdClaimKey] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState("");

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getWallet();
      setWallet(data.wallet);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTx = useCallback(async (p) => {
    setTxLoading(true);
    try {
      const data = await api.getTransactions(p, PAGE_SIZE);
      setTx({ items: data.transactions || [], totalPages: data.totalPages || 1 });
    } catch (e) {
      setError(e.message);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadDaily = useCallback(async () => {
    try {
      setDaily(await api.getDaily());
    } catch {
      /* the claim card simply stays hidden if this fails */
    }
  }, []);

  const loadAdReward = useCallback(async () => {
    try {
      setAdReward(await api.getAdReward());
      setAdError("");
    } catch (e) {
      setAdError(e.message);
    }
  }, []);

  const claimDaily = async () => {
    setClaiming(true);
    setNotice("");
    setError("");
    try {
      const data = await api.claimDaily();
      setNotice(data.message);
      setWallet(data.wallet); // balance comes from the server response
      setPage(1);
      await loadTx(1);
    } catch (e) {
      setError(e.message);
    } finally {
      await loadDaily();
      setClaiming(false);
    }
  };

  const startAd = async () => {
    if (adBusy) return;
    setAdBusy(true);
    setAdError("");
    setAdNotice("");
    const key = adStartKey || crypto.randomUUID();
    setAdStartKey(key);
    try {
      const data = await api.startAdReward(key);
      setAdReward({
        amount: data.amount,
        dailyLimit: data.dailyLimit,
        claimsUsed: data.claimsUsed,
        claimsRemaining: data.claimsRemaining,
        watchDurationSeconds: data.watchDurationSeconds,
        resetsAt: data.resetsAt,
        activeSession: data.activeSession,
      });
      setAdNow(Date.now());
      setAdStartKey("");
      setAdClaimKey("");
      setAdNotice("Your demo ad is ready. Keep this card open until the timer finishes.");
    } catch (e) {
      setAdError(e.message);
    } finally {
      setAdBusy(false);
    }
  };

  const claimAd = async () => {
    if (adBusy || !adReward?.activeSession) return;
    setAdBusy(true);
    setAdError("");
    setAdNotice("");
    const key = adClaimKey || crypto.randomUUID();
    setAdClaimKey(key);
    try {
      const data = await api.claimAdReward(adReward.activeSession.sessionId, key);
      setWallet(data.wallet);
      setAdReward({
        amount: data.amount,
        dailyLimit: data.dailyLimit,
        claimsUsed: data.claimsUsed,
        claimsRemaining: data.claimsRemaining,
        watchDurationSeconds: data.watchDurationSeconds,
        resetsAt: data.resetsAt,
        activeSession: data.activeSession,
      });
      setAdClaimKey("");
      setAdNotice(data.message);
      setPage(1);
      await loadTx(1);
    } catch (e) {
      setAdError(e.message);
      await loadAdReward();
    } finally {
      setAdBusy(false);
    }
  };

  // Always refetched from the server on mount, so it is fresh after a withdrawal.
  useEffect(() => { loadWallet(); }, [loadWallet]);
  useEffect(() => { loadTx(page); }, [page, loadTx]);
  useEffect(() => { loadDaily(); }, [loadDaily]);
  useEffect(() => { loadAdReward(); }, [loadAdReward]);
  useEffect(() => {
    if (!adReward?.activeSession) return undefined;
    const timer = window.setInterval(() => setAdNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [adReward?.activeSession?.sessionId]);

  if (loading) return <Loading label="Loading your wallet…" />;
  if (error && !wallet) return <ErrorBox message={error} onRetry={() => { loadWallet(); loadTx(page); }} />;

  return (
    <>
      {demoAd}
      <section className="wallet-head">
        <div>
          <p className="wallet-eyebrow">YOUR WALLET</p>
          <p className="wallet-balance-label">Available balance</p>
          <h1 className="big-number">{fmt(wallet.ves)} <span>VEs</span></h1>
          <p className="wallet-balance-note">Your balance across the VELoop wallet</p>
        </div>
        <button className="btn btn-primary wallet-redeem" onClick={() => navigate("/payout")}>
          <span aria-hidden="true">↗</span> Redeem VEs
        </button>
      </section>

      <section className="balances" aria-label="Wallet balances">
        {CURRENCIES.filter((c) => c.key !== "ves").map((c) => (
          <div className="balance" key={c.key}>
            <span className="muted">{c.label}</span>
            <strong>{fmt(wallet[c.key] ?? 0)}</strong>
          </div>
        ))}
      </section>

      <section className="feature-links" aria-label="Wallet features">
        <button className="feature-link" onClick={() => navigate("/features?tab=exchange")}>
          <strong>Exchange</strong><span>Convert VEs to other wallet currencies</span>
        </button>
        <button className="feature-link" onClick={() => navigate("/features?tab=referrals")}>
          <strong>Refer &amp; earn</strong><span>Invite friends with your referral link</span>
        </button>
        <button className="feature-link" onClick={() => navigate("/features?tab=spin")}>
          <strong>Spin for rewards</strong><span>Use spins to play for wallet rewards</span>
        </button>
        <button className="feature-link" onClick={() => navigate("/features?tab=mining")}>
          <strong>Mining</strong><span>Earn VEs over time and claim them</span>
        </button>
        <button className="feature-link" onClick={() => navigate("/features?tab=games")}>
          <strong>Games</strong><span>Play a number-guess challenge for VEs</span>
        </button>
      </section>

      {daily && (
        <section className="card daily">
          <div>
            <h2>Daily reward</h2>
            <p className="muted">
              {daily.claimed
                ? "You have claimed today's reward. Come back tomorrow."
                : `Claim +${fmt(daily.amount)} VEs once every day.`}
            </p>
            {notice && <p className="notice" role="status">{notice}</p>}
          </div>
          <button className="btn btn-primary"
            onClick={() => requestDemoAd({ title: "Watch before claiming your daily reward", onContinue: claimDaily })}
            disabled={daily.claimed || claiming}>
            {claiming ? "Claiming…" : daily.claimed ? "Claimed" : "Claim reward"}
          </button>
        </section>
      )}

      {!adReward && adError && (
        <section className="card ad-reward-error">
          <p className="field-error" role="alert">{adError}</p>
          <button className="btn btn-ghost" onClick={loadAdReward}>Retry</button>
        </section>
      )}
      {adReward && (
        <section className={`card ad-reward-card ${adReward.activeSession ? "ad-session-active" : ""}`}>
          <div className="ad-reward-art" aria-hidden="true">
            <span className="ad-reward-play">▶</span>
            <span className="ad-reward-spark spark-one">✦</span>
            <span className="ad-reward-spark spark-two">✦</span>
          </div>
          <div className="ad-reward-content">
            <p className="ad-reward-eyebrow">EXTRA WALLET REWARDS <span>DEMO</span></p>
            <h2>{adReward.activeSession ? "Your reward is almost ready" : "Watch a short ad, earn VEs"}</h2>
            <p className="muted">
              {adReward.claimsRemaining > 0
                ? `Complete a short demo ad to earn ${fmt(adReward.amount)} VEs. ${adReward.claimsRemaining} of ${adReward.dailyLimit} rewards left today.`
                : "You’ve claimed all available ad rewards for today. Come back after the daily reset."}
            </p>
            {adReward.activeSession && (() => {
              const eligibleAt = new Date(adReward.activeSession.eligibleAt).getTime();
              const expiresAt = new Date(adReward.activeSession.expiresAt).getTime();
              const secondsRemaining = Math.max(0, Math.ceil((eligibleAt - adNow) / 1000));
              const expired = expiresAt <= adNow;
              const progress = expired ? 0 : Math.min(100,
                ((adReward.watchDurationSeconds - secondsRemaining) / adReward.watchDurationSeconds) * 100);
              return (
                <div className={`ad-watch-status ${expired ? "expired" : ""}`}>
                  <div className="ad-watch-label">
                    <span>{expired ? "Demo expired" : secondsRemaining > 0 ? "Demo ad playing" : "Ad complete"}</span>
                    <strong>{expired ? "Restart" : secondsRemaining > 0 ? `${secondsRemaining}s` : "Ready"}</strong>
                  </div>
                  <div className="ad-watch-track" role="progressbar" aria-label="Demo ad progress"
                    aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.floor(progress)}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <p>{expired ? "This demo session expired. Start another ad to continue." : "A reward becomes claimable when the server timer completes."}</p>
                </div>
              );
            })()}
            {adError && <p className="field-error ad-error" role="alert">{adError}</p>}
            {adNotice && <p className="ad-notice" role="status">{adNotice}</p>}
          </div>
          <div className="ad-reward-action">
            <div className="ad-reward-amount"><strong>+{fmt(adReward.amount)}</strong><span>VEs</span></div>
            {adReward.activeSession ? (() => {
              const expired = new Date(adReward.activeSession.expiresAt).getTime() <= adNow;
              return expired ? (
                <button className="btn btn-primary" onClick={startAd} disabled={adBusy || adReward.claimsRemaining < 1}>
                  {adBusy ? "Starting…" : "Start another"}
                </button>
              ) : (
                <span className="ad-video-prompt">Finish the demo video to claim</span>
              );
            })() : (
              <button className="btn btn-primary" onClick={startAd}
                disabled={adBusy || adReward.claimsRemaining < 1}>
                {adBusy ? "Starting…" : adReward.claimsRemaining < 1 ? "Limit reached" : "Watch demo ad"}
              </button>
            )}
            <span className="ad-daily-count">{adReward.claimsUsed}/{adReward.dailyLimit} claimed</span>
          </div>
          <p className="ad-demo-disclaimer">Demo only — no real ad is shown or verified.</p>
        </section>
      )}
      {adReward?.activeSession && (() => {
        const eligibleAt = new Date(adReward.activeSession.eligibleAt).getTime();
        const expired = new Date(adReward.activeSession.expiresAt).getTime() <= adNow;
        return !expired && (
          <DemoAdPlayer
            key={adReward.activeSession.sessionId}
            durationSeconds={adReward.watchDurationSeconds}
            title={`Watch to earn ${fmt(adReward.amount)} VEs`}
            claimReady={eligibleAt <= adNow}
            claimLabel={`Claim +${fmt(adReward.amount)} VEs`}
            onClaim={claimAd}
            onWatched={() => setAdNotice("Demo video complete. Claim your reward when the timer finishes.")}
            busy={adBusy || claiming}
            error={adError}
          />
        );
      })()}

      <section className="card">
        <div className="transaction-heading">
          <div>
            <p className="wallet-eyebrow">ACTIVITY</p>
            <h2>Transaction history</h2>
          </div>
          <span className="transaction-count">{tx.totalPages > 1 ? `Page ${page} of ${tx.totalPages}` : `${tx.items.length} ${tx.items.length === 1 ? "entry" : "entries"}`}</span>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        {txLoading ? (
          <Loading />
        ) : tx.items.length === 0 ? (
          <p className="muted">No transactions yet. Rewards you earn will show up here.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Activity</th><th>Status</th><th className="num">Amount</th><th className="num">Balance after</th></tr>
              </thead>
              <tbody>
                {tx.items.map((t) => {
                  const credit = t.type === "CREDIT";
                  return (
                    <tr key={t.transactionId}>
                      <td><span className="transaction-date">{fmtDate(t.createdAt)}</span></td>
                      <td>
                        <div className="transaction-activity">
                          <span className={`transaction-icon ${credit ? "credit" : "debit"}`} aria-hidden="true">{transactionIcon(t.source, credit)}</span>
                          <span><strong>{t.description || formatSource(t.source)}</strong><small>{formatSource(t.source)}</small></span>
                        </div>
                      </td>
                      <td><span className={`pill pill-${String(t.status).toLowerCase()}`}>{String(t.status).toLowerCase() === "posted" ? "Completed" : t.status}</span></td>
                      <td className={`num transaction-amount ${credit ? "credit" : "debit"}`}>
                        {credit ? "+" : "−"}{fmt(t.amount)} {CURRENCIES.find((c) => c.key === t.currency)?.label || t.currency}
                      </td>
                      <td className="num transaction-balance">{fmt(t.balanceAfter)} {CURRENCIES.find((c) => c.key === t.currency)?.label || t.currency}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted">Page {page} of {tx.totalPages}</span>
          <button className="btn btn-ghost" disabled={page >= tx.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </section>
    </>
  );
}
