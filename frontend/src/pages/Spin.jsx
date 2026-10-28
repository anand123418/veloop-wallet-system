import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Loading, ErrorBox } from "../components/State.jsx";
import { useDemoAdGate } from "../components/useDemoAdGate.jsx";

const LABELS = { ves: "VEs", sves: "SVEs", gems: "Gems", tokens: "Tokens", spins: "Spins", none: "" };
const CURRENCY_ICONS = { ves: "V", sves: "S", gems: "◆", tokens: "◈", spins: "↻", none: "✦" };
const fmt = (amount) => Number(amount).toLocaleString("en-IN");

function prizeDescription(prize) {
  if (prize.currency === "none" || prize.amount === 0) return "A little suspense";
  return `${fmt(prize.amount)} ${LABELS[prize.currency] || prize.currency}`;
}

export default function Spin() {
  const { requestDemoAd, demoAd } = useDemoAdGate();
  const [wallet, setWallet] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [spinCost, setSpinCost] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [recentSpins, setRecentSpins] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [prizeData, walletData] = await Promise.all([api.getSpinPrizes(), api.getWallet()]);
      setPrizes(prizeData.prizes || []);
      setSpinCost(prizeData.spinCost);
      setWallet(walletData.wallet);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const playSpin = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api.playSpin(crypto.randomUUID());
      setWallet(data.wallet);
      setResult(data.spin);
      setRecentSpins((previous) => [data.spin, ...previous].slice(0, 5));
      window.dispatchEvent(new Event("veloop:wallet-updated"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const play = () => {
    if (busy) return;
    requestDemoAd({ title: "Watch before using a spin", onContinue: playSpin });
  };

  if (loading) return <Loading label="Loading spin rewards…" />;
  if (error && !wallet) return <ErrorBox message={error} onRetry={load} />;

  const canSpin = wallet?.spins >= spinCost && prizes.length > 0;
  const bestPrize = prizes
    .filter((prize) => prize.currency !== "none" && prize.amount > 0)
    .reduce((best, prize) => !best || prize.amount > best.amount ? prize : best, null);

  return (
    <div className="spin-page">
      {demoAd}
      {error && <p className="field-error spin-alert" role="alert">{error}</p>}

      <section className="spin-hero">
        <div className="spin-hero-copy">
          <p className="spin-eyebrow"><span aria-hidden="true">✦</span> VELOOP REWARDS</p>
          <h2>Spin. Win. Repeat.</h2>
          <p>Use your spins for a chance to win VEs, Gems, Tokens, or even an extra spin.</p>
          <div className="spin-hero-stats">
            <div><strong>{fmt(wallet?.spins || 0)}</strong><span>spins available</span></div>
            <span className="spin-stat-divider" />
            <div><strong>{prizes.length}</strong><span>prize types</span></div>
          </div>
        </div>
        <div className={`spin-wheel-shell ${busy ? "spinning" : ""}`}>
          <span className="spin-wheel-pointer" aria-hidden="true" />
          <div className="spin-wheel" aria-hidden="true">
            <span className="spin-wheel-center"><span>V</span></span>
          </div>
        </div>
        <span className="spin-hero-orbit spin-hero-orbit-one" aria-hidden="true" />
        <span className="spin-hero-orbit spin-hero-orbit-two" aria-hidden="true" />
      </section>

      <div className="spin-layout">
        <section className="card spin-play-card">
          <div className="spin-play-heading">
            <div>
              <p className="spin-section-label">YOUR NEXT CHANCE</p>
              <h3>Ready for a spin?</h3>
            </div>
            <span className="spin-cost"><span aria-hidden="true">↻</span> {spinCost} per play</span>
          </div>
          <p className="muted spin-play-description">
            Every spin is selected securely by the server using the published prize chances.
          </p>
          <button className="btn btn-primary spin-play-button" onClick={play} disabled={busy || !canSpin}>
            {busy ? "Spinning…" : !prizes.length ? "Rewards unavailable" : !canSpin ? "No spins available" : "Spin now"}
            {!busy && canSpin && <span aria-hidden="true">→</span>}
          </button>
          {!canSpin && prizes.length > 0 && (
            <p className="spin-empty-hint">Earn or exchange VEs for more spins and come back to play.</p>
          )}
          {result && (
            <div className={`spin-result-card ${result.rewardAmount > 0 && result.rewardCurrency !== "none" ? "won" : "miss"}`}
              role="status" aria-live="polite">
              <span className="spin-result-icon" aria-hidden="true">
                {result.rewardAmount > 0 && result.rewardCurrency !== "none" ? "✦" : "↻"}
              </span>
              <div>
                <span className="spin-result-label">
                  {result.rewardAmount > 0 && result.rewardCurrency !== "none" ? "YOU WON" : "NEXT TIME"}
                </span>
                <strong>{result.rewardAmount > 0 && result.rewardCurrency !== "none"
                  ? prizeDescription(result)
                  : result.prizeName || "No prize this time"}</strong>
                <span className="spin-result-detail">
                  {result.rewardCurrency === "spins" ? "Your extra spin is ready to use." :
                    result.rewardAmount > 0 ? "Your wallet balance has been updated." : "Your spin was used. Try again when you have another."}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="card spin-prize-panel">
          <div className="spin-panel-heading">
            <div>
              <p className="spin-section-label">THE PRIZE POOL</p>
              <h3>Rewards and chances</h3>
            </div>
            {bestPrize && <span className="spin-top-prize">Top prize · {prizeDescription(bestPrize)}</span>}
          </div>
          {!prizes.length ? (
            <p className="muted">Spin rewards are unavailable right now.</p>
          ) : (
            <div className="spin-prize-list">
              {prizes.map((prize) => (
                <div className="spin-prize-row" key={prize.prizeId}>
                  <span className={`spin-prize-icon spin-prize-${prize.currency}`} aria-hidden="true">
                    {CURRENCY_ICONS[prize.currency] || "✦"}
                  </span>
                  <div className="spin-prize-info">
                    <div className="spin-prize-title">
                      <strong>{prize.name}</strong>
                      <span>{prize.chancePercent}%</span>
                    </div>
                    <div className="spin-odds-track" aria-label={`${prize.chancePercent}% chance`}>
                      <span style={{ width: `${Math.max(prize.chancePercent, 1)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="spin-odds-note">Odds are calculated from the active prize weights and may change when rewards are configured.</p>
        </section>
      </div>

      {recentSpins.length > 0 && (
        <section className="card spin-history">
          <div className="spin-panel-heading">
            <div>
              <p className="spin-section-label">THIS SESSION</p>
              <h3>Recent spins</h3>
            </div>
            <span className="spin-session-count">{recentSpins.length} {recentSpins.length === 1 ? "play" : "plays"}</span>
          </div>
          <div className="spin-history-list">
            {recentSpins.map((spin) => (
              <div className="spin-history-item" key={spin.spinId}>
                <span className={`spin-history-icon ${spin.rewardAmount > 0 && spin.rewardCurrency !== "none" ? "won" : ""}`}
                  aria-hidden="true">
                  {spin.rewardAmount > 0 && spin.rewardCurrency !== "none" ? "✦" : "↻"}
                </span>
                <div><strong>{spin.prizeName}</strong><span>{new Date(spin.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                <span className={spin.rewardAmount > 0 && spin.rewardCurrency !== "none" ? "spin-history-won" : "spin-history-no-win"}>
                  {spin.rewardAmount > 0 && spin.rewardCurrency !== "none" ? `+${prizeDescription(spin)}` : "No prize"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
