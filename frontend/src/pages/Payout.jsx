import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Loading, ErrorBox } from "../components/State.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";

const fmt = (n) => Number(n).toLocaleString("en-IN");

// Which details to collect per method. The backend validates them again.
// If your backend returns `fields` on each method, that will be used instead.
const DEFAULT_FIELDS = {
  upi: [{ name: "upiId", label: "UPI ID", placeholder: "name@bank", type: "text" }],
  amazon: [{ name: "email", label: "Email to receive the gift card", placeholder: "you@example.com", type: "email" }],
  google_play: [{ name: "email", label: "Email to receive the gift card", placeholder: "you@example.com", type: "email" }],
};

export default function Payout() {
  const navigate = useNavigate();
  const [methods, setMethods] = useState([]);
  const [balance, setBalance] = useState(null);
  const [method, setMethod] = useState(null);
  const [options, setOptions] = useState([]);
  const [option, setOption] = useState(null);
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [optLoading, setOptLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState(null);
  // One key per confirmation attempt: double-clicks and retries reuse it,
  // so the backend can treat them as the same request.
  const [idemKey, setIdemKey] = useState(null);

  const loadMethods = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, walletData] = await Promise.all([api.getMethods(), api.getWallet()]);
      setMethods(data.methods || []);
      setBalance(walletData.wallet.ves);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadMethods(); }, []);

  const pickMethod = async (m) => {
    setMethod(m);
    setOption(null);
    setDetails({});
    setOptions([]);
    setOptLoading(true);
    setError("");
    try {
      const data = await api.getOptions(m.method);
      setOptions(data.options || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setOptLoading(false);
    }
  };

  const fields = method ? method.fields || DEFAULT_FIELDS[method.method] || [] : [];
  const detailsComplete = fields.length > 0 && fields.every((f) => (details[f.name] || "").trim());
  const canContinue = method && option && detailsComplete;
  const currentStep = !method ? 1 : !option ? 2 : 3;

  const openConfirm = () => {
    setSubmitError("");
    setIdemKey(crypto.randomUUID());
    setConfirming(true);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setSubmitError("");
    try {
      const trimmed = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.trim()]));
      // Only identifiers are sent. The server decides the VE cost and payout value.
      const data = await api.createWithdrawal(
        { method: method.method, optionId: option.optionId, payoutDetails: trimmed },
        idemKey
      );
      setResult(data.withdrawal || {});
      setConfirming(false);
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading label="Loading payout methods…" />;
  if (error && methods.length === 0) return <ErrorBox message={error} onRetry={loadMethods} />;

  if (result) {
    return (
      <section className="payout-success">
        <div className="payout-success-icon" aria-hidden="true">✓</div>
        <p className="payout-eyebrow">REQUEST RECEIVED</p>
        <h1>Redemption is in motion</h1>
        <p className="muted">Your request has been submitted. We’ll update its status as it moves through processing.</p>
        <div className="payout-success-summary">
          <div><span>Payout</span><strong>₹{fmt(option.payoutValue)}</strong></div>
          <div><span>Method</span><strong>{method.name}</strong></div>
          <div><span>Status</span><strong><span className="pill pill-pending">{result.status || "PENDING"}</span></strong></div>
        </div>
        {result.withdrawalId && <p className="payout-reference">Reference <strong>{result.withdrawalId}</strong></p>}
        <p className="payout-processing-note">Processing usually takes up to 24 hours, and up to 72 hours if the request needs review.</p>
        <button className="btn btn-primary" onClick={() => navigate("/wallet")}>Back to wallet <span aria-hidden="true">→</span></button>
      </section>
    );
  }

  return (
    <div className="payout-content">
      <header className="payout-header">
        <p className="payout-eyebrow">WALLET REWARDS</p>
        <h1>Redeem your VEs</h1>
        <p>Choose how you’d like to redeem your balance. You’ll review everything before submitting.</p>
        <div className="payout-balance">
          <span className="payout-balance-icon" aria-hidden="true">V</span>
          <span><small>Available balance</small><strong>{fmt(balance || 0)} VEs</strong></span>
          <button type="button" onClick={() => navigate("/wallet")}>Wallet <span aria-hidden="true">↗</span></button>
        </div>
      </header>
      {error && <p className="field-error" role="alert">{error}</p>}

      <ol className="payout-progress" aria-label="Payout steps">
        {["Method", "Amount", "Details"].map((label, index) => {
          const step = index + 1;
          const complete = step < currentStep || (step === 3 && canContinue);
          return (
            <li key={label} className={`${step === currentStep ? "current" : ""} ${complete ? "complete" : ""}`}
              aria-current={step === currentStep ? "step" : undefined}>
              <span>{complete ? "✓" : step}</span><strong>{label}</strong>
            </li>
          );
        })}
      </ol>

      <section className="card payout-step">
        <div className="payout-step-heading">
          <span className="payout-step-number">01</span>
          <div><h2>Choose a payout method</h2><p>Where should we send your reward?</p></div>
        </div>
        <div className="choices">
          {methods.map((m) => (
            <button
              key={m.method}
              className={`choice ${method?.method === m.method ? "selected" : ""}`}
              onClick={() => pickMethod(m)}
              type="button"
              aria-pressed={method?.method === m.method}
            >
              <span className={`payout-method-icon method-${m.method}`} aria-hidden="true">
                {m.method === "upi" ? "₹" : m.method === "amazon" ? "a" : m.method === "google_play" ? "▶" : "↗"}
              </span>
              {m.name}
              {method?.method === m.method && <span className="payout-method-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {method && (
        <section className="card payout-step">
          <div className="payout-step-heading">
            <span className="payout-step-number">02</span>
            <div><h2>Choose a payout amount</h2><p>Pick an option that fits your available balance.</p></div>
          </div>
          {optLoading ? (
            <Loading />
          ) : options.length === 0 ? (
            <p className="muted">No options are available for this method right now.</p>
          ) : (
            <div className="choices">
              {options.map((o) => {
                const insufficient = balance !== null && o.requiredAmount > balance;
                const unavailable = o.active === false || o.eligible === false || insufficient;
                return (
                  <button
                    key={o.optionId}
                    className={`choice option payout-option ${option?.optionId === o.optionId ? "selected" : ""} ${unavailable ? "unavailable" : ""}`}
                    disabled={unavailable}
                    onClick={() => setOption(o)}
                    type="button"
                    aria-pressed={option?.optionId === o.optionId}
                  >
                    <span className="payout-option-value">₹{fmt(o.payoutValue)}</span>
                    <span className="payout-option-cost">{fmt(o.requiredAmount)} VEs</span>
                    <span className="payout-option-footer">{insufficient ? "Not enough VEs" : o.eligible === false ? "Not eligible yet" : unavailable ? "Unavailable" : "Ready to redeem"}</span>
                    {option?.optionId === o.optionId && <span className="payout-option-selected" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {method && option && (
        <section className="card payout-step payout-details">
          <div className="payout-step-heading">
            <span className="payout-step-number">03</span>
            <div><h2>Where should we send it?</h2><p>Your payout details are only used to process this request.</p></div>
          </div>
          {fields.map((f) => (
            <label key={f.name}>{f.label}
              <input
                type={f.type || "text"}
                placeholder={f.placeholder}
                value={details[f.name] || ""}
                onChange={(e) => setDetails({ ...details, [f.name]: e.target.value })}
                autoComplete="off"
                required
              />
            </label>
          ))}
          <div className="payout-review-inline">
            <span><strong>₹{fmt(option.payoutValue)}</strong><small>for {fmt(option.requiredAmount)} VEs</small></span>
            <button className="btn btn-primary" disabled={!canContinue} onClick={openConfirm}>Review request <span aria-hidden="true">→</span></button>
          </div>
        </section>
      )}

      {confirming && (
        <ConfirmModal
          title="Redeem this reward?"
          confirmLabel="Confirm"
          busy={busy}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        >
          <dl className="summary">
            <dt>Method</dt><dd>{method.name}</dd>
            <dt>Payout</dt><dd>₹{fmt(option.payoutValue)}</dd>
            <dt>Required</dt><dd>{fmt(option.requiredAmount)} VEs</dd>
            {fields.map((f) => (<Fragment key={f.name}><dt>{f.label}</dt><dd>{details[f.name]}</dd></Fragment>))}
          </dl>
          <p className="payout-confirm-note">The server verifies your balance and confirms the final payout amount when you submit.</p>
          {submitError && <p className="field-error" role="alert">{submitError}</p>}
        </ConfirmModal>
      )}
    </div>
  );
}
