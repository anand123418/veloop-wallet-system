import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorBox, Loading } from "../components/State.jsx";
import { useDemoAdGate } from "../components/useDemoAdGate.jsx";

const fmt = (amount) => Number(amount).toLocaleString("en-IN");

export default function Mining() {
  const { requestDemoAd, demoAd } = useDemoAdGate();
  const [mining, setMining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimKey, setClaimKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.getMiningStatus();
      setMining(data.mining);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(false), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const start = async () => {
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const data = await api.startMining();
      setMining(data.mining);
      setNotice(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const claimMining = async () => {
    if (claiming) return;
    setClaiming(true);
    setError("");
    setNotice("");
    const idempotencyKey = claimKey || crypto.randomUUID();
    setClaimKey(idempotencyKey);
    try {
      const data = await api.claimMining(idempotencyKey);
      setMining(data.mining);
      setNotice(data.message);
      setClaimKey("");
      window.dispatchEvent(new Event("veloop:wallet-updated"));
    } catch (err) {
      setError(err.message);
      await load(false);
    } finally {
      setClaiming(false);
    }
  };

  const claim = () => {
    if (claiming) return;
    requestDemoAd({ title: "Watch before claiming your mining rewards", onContinue: claimMining });
  };

  if (loading) return <Loading label="Loading mining session…" />;
  if (error && !mining) return <ErrorBox message={error} onRetry={() => load()} />;

  const sessionElapsedMs = mining.active && mining.startedAt
    ? Math.max(0, Date.now() - new Date(mining.startedAt).getTime())
    : 0;
  const sessionDurationMs = mining.maxDurationHours * 60 * 60 * 1000;
  const sessionProgress = Math.min(100, (sessionElapsedMs / sessionDurationMs) * 100);

  return (
    <div className="mining-page">
      {demoAd}
      {error && <p className="field-error mining-alert" role="alert">{error}</p>}
      {notice && <p className="mining-notice" role="status">{notice}</p>}
      <section className={`mining-hero ${mining.active ? "is-active" : ""}`}>
        <div className="mining-hero-copy">
          <p className="mining-eyebrow"><span aria-hidden="true">✦</span> VELOOP REWARDS</p>
          <h2>Put your wallet to work.</h2>
          <p>Let your mining session build rewards over time, then claim your VEs when they’re ready.</p>
          <span className={`mining-session-badge ${mining.active ? "active" : ""}`}>
            <span /> {mining.active ? "SESSION ACTIVE" : "READY WHEN YOU ARE"}
          </span>
        </div>
        <div className={`mining-illustration ${mining.active ? "active" : ""}`} aria-hidden="true">
          <span className="mining-pickaxe">⛏</span>
          <span className="mining-crystal crystal-one">◆</span>
          <span className="mining-crystal crystal-two">◆</span>
          <span className="mining-crystal crystal-three">◆</span>
        </div>
        <span className="mining-orbit mining-orbit-one" aria-hidden="true" />
        <span className="mining-orbit mining-orbit-two" aria-hidden="true" />
      </section>

      <section className="mining-stats" aria-label="Mining details">
        <div className="mining-stat-card">
          <span className="mining-stat-icon" aria-hidden="true">↗</span>
          <span className="muted">Mining rate</span>
          <strong>{fmt(mining.rateVesPerMinute)} <small>VEs / min</small></strong>
        </div>
        <div className="mining-stat-card highlighted">
          <span className="mining-stat-icon" aria-hidden="true">✦</span>
          <span className="muted">Ready to claim</span>
          <strong>{fmt(mining.claimableVes)} <small>VEs</small></strong>
        </div>
        <div className="mining-stat-card">
          <span className="mining-stat-icon" aria-hidden="true">◷</span>
          <span className="muted">Session limit</span>
          <strong>{mining.maxDurationHours} <small>hours</small></strong>
        </div>
      </section>

      <section className="card mining-console">
        <div className="mining-console-heading">
          <div>
            <p className="mining-section-label">MINING SESSION</p>
            <h3>{mining.active ? "Your VEs are accumulating" : "Start earning over time"}</h3>
          </div>
          <span className={`mining-live-indicator ${mining.active ? "active" : ""}`}>
            <span /> {mining.active ? "LIVE" : "IDLE"}
          </span>
        </div>

        {mining.active ? (
          <>
            <div className="mining-progress-copy">
              <span>Session progress</span>
              <strong>{Math.floor(sessionProgress)}%</strong>
            </div>
            <div className="mining-progress-track" role="progressbar"
              aria-label="Mining session progress" aria-valuemin="0" aria-valuemax="100"
              aria-valuenow={Math.floor(sessionProgress)}>
              <span style={{ width: `${sessionProgress}%` }} />
            </div>
            <div className="mining-action-row">
              <div className="mining-action-info">
                {mining.canClaim ? (
                  <><strong>Rewards are ready</strong><span>Claim your accumulated VEs to your wallet.</span></>
                ) : mining.sessionComplete ? (
                  <><strong>Session limit reached</strong><span>Close this session to start mining again.</span></>
                ) : mining.cooldownRemainingSeconds > 0 ? (
                  <><strong>Keep earning</strong><span>Next claim available in about {mining.cooldownRemainingSeconds}s.</span></>
                ) : (
                  <><strong>Mining in progress</strong><span>Rewards become claimable over time.</span></>
                )}
              </div>
              <button className="btn btn-primary mining-action-button" onClick={claim} disabled={!mining.canClaim || claiming}>
                {claiming ? "Claiming…" : mining.sessionComplete && mining.claimableVes === 0
                  ? "Finish session"
                  : `Claim ${fmt(mining.claimableVes)} VEs`}
                {!claiming && mining.canClaim && <span aria-hidden="true">→</span>}
              </button>
            </div>
          </>
        ) : (
          <div className="mining-start-row">
            <p className="muted">Start a session to begin earning {fmt(mining.rateVesPerMinute)} VEs every minute.</p>
            <button className="btn btn-primary mining-action-button" onClick={start} disabled={starting}>
              {starting ? "Starting…" : "Start mining"} {!starting && <span aria-hidden="true">→</span>}
            </button>
          </div>
        )}
      </section>
      <p className="mining-footnote">
        Demo settings: {fmt(mining.rateVesPerMinute)} VEs/min · claims every {mining.claimIntervalSeconds}s ·
        {` ${mining.maxDurationHours}-hour session cap`}
      </p>
    </div>
  );
}
