import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Loading, ErrorBox } from "../components/State.jsx";

const fmt = (amount) => Number(amount).toLocaleString("en-IN");
const fmtDate = (date) => new Date(date).toLocaleDateString("en-IN", {
  day: "2-digit", month: "short", year: "numeric",
});

export default function Referrals() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inviteUrl = summary
    ? `${window.location.origin}/register?ref=${encodeURIComponent(summary.referralCode)}`
    : "";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await api.getReferrals());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("Invite link copied.");
    } catch {
      setError("Could not copy the invite link. Select and copy it manually.");
    }
  };

  if (loading) return <Loading label="Loading referrals…" />;
  if (error && !summary) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="referrals-page">
      {notice && <p className="referral-notice" role="status">{notice}</p>}
      {error && <p className="field-error referral-alert" role="alert">{error}</p>}
      <section className="referral-hero">
        <div className="referral-hero-copy">
          <p className="referral-eyebrow"><span aria-hidden="true">↗</span> SHARE THE REWARDS</p>
          <h2>Good things grow<br />when shared.</h2>
          <p>Invite friends to VELoop. When they join with your link, you earn {fmt(summary.rewardPerSignup)} VEs.</p>
        </div>
        <div className="referral-hero-visual" aria-hidden="true">
          <span className="referral-person person-one">●</span>
          <span className="referral-person person-two">●</span>
          <span className="referral-person person-three">●</span>
          <span className="referral-connection">↗</span>
          <span className="referral-visual-reward">+{fmt(summary.rewardPerSignup)}<small> VEs</small></span>
        </div>
      </section>

      <section className="referral-stats" aria-label="Referral summary">
        <div className="referral-stat-card">
          <span className="referral-stat-icon" aria-hidden="true">♧</span>
          <span className="muted">Successful referrals</span>
          <strong>{fmt(summary.totalReferrals)}</strong>
        </div>
        <div className="referral-stat-card earned">
          <span className="referral-stat-icon" aria-hidden="true">✦</span>
          <span className="muted">Total VEs earned</span>
          <strong>{fmt(summary.earnedVes)} <small>VEs</small></strong>
        </div>
        <div className="referral-stat-card">
          <span className="referral-stat-icon" aria-hidden="true">＋</span>
          <span className="muted">Reward per signup</span>
          <strong>{fmt(summary.rewardPerSignup)} <small>VEs</small></strong>
        </div>
      </section>

      <section className="card referral-share-card">
        <div className="referral-share-heading">
          <div>
            <p className="referral-section-label">YOUR PERSONAL INVITE</p>
            <h3>Share your referral link</h3>
            <p className="muted">Your friend’s account will be linked to your referral code when they sign up.</p>
          </div>
          <span className="referral-code-badge">{summary.referralCode}</span>
        </div>
        <div className="referral-link-field">
          <input aria-label="Your invite link" value={inviteUrl} readOnly onFocus={(event) => event.target.select()} />
          <button className="btn btn-primary" onClick={copyLink}>
            <span aria-hidden="true">▣</span> Copy link
          </button>
        </div>
        <p className="referral-share-hint">Anyone who creates an account using this link will count as your referral.</p>
      </section>

      <section className="card referral-history-card">
        <div className="referral-history-heading">
          <div>
            <p className="referral-section-label">YOUR COMMUNITY</p>
            <h3>Recent referrals</h3>
          </div>
          <span className="referral-total-badge">{fmt(summary.totalReferrals)} total</span>
        </div>
        {summary.referrals.length === 0 ? (
          <div className="referral-empty">
            <span aria-hidden="true">↗</span>
            <strong>Your referral story starts here</strong>
            <p className="muted">Share your invite link to earn your first referral rewards.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Status</th><th className="num">Reward</th></tr></thead>
              <tbody>
                {summary.referrals.map((referral) => (
                  <tr key={referral.referralId}>
                    <td>{fmtDate(referral.createdAt)}</td>
                    <td><span className="pill">{referral.status}</span></td>
                    <td className="num credit">+{fmt(referral.rewardAmount)} VEs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
