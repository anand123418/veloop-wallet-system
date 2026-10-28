import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Loading, ErrorBox } from "../components/State.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { useDemoAdGate } from "../components/useDemoAdGate.jsx";

const LABELS = { ves: "VEs", sves: "SVEs", gems: "Gems", tokens: "Tokens", spins: "Spins" };
const fmt = (amount) => Number(amount).toLocaleString("en-IN");

export default function Exchange() {
  const { requestDemoAd, demoAd } = useDemoAdGate();
  const [rates, setRates] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const rate = useMemo(() => rates.find((item) => item.toCurrency === target), [rates, target]);
  const numericAmount = Number(amount);
  const validAmount = Number.isSafeInteger(numericAmount) && numericAmount > 0;
  const exactMultiple = Boolean(rate && validAmount && numericAmount % rate.fromAmount === 0);
  const outputAmount = exactMultiple ? (numericAmount / rate.fromAmount) * rate.toAmount : 0;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [rateData, walletData] = await Promise.all([api.getExchangeRates(), api.getWallet()]);
      setRates(rateData.rates || []);
      setWallet(walletData.wallet);
      setTarget((current) => current || rateData.rates?.[0]?.toCurrency || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openConfirmation = (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIdempotencyKey(crypto.randomUUID());
    setConfirming(true);
  };

  const submitExchange = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.exchange({ toCurrency: target, amount: numericAmount }, idempotencyKey);
      setWallet(result.wallet);
      setNotice(result.message);
      setConfirming(false);
      setAmount("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (busy) return;
    setConfirming(false);
    requestDemoAd({ title: "Watch before confirming your exchange", onContinue: submitExchange });
  };

  if (loading) return <Loading label="Loading exchange rates…" />;
  if (error && !wallet) return <ErrorBox message={error} onRetry={load} />;

  return (
    <>
      {demoAd}
      <h1>Exchange currencies</h1>
      <p className="muted section-intro">Rates are provided by the server. Exchanges debit and credit your wallet together.</p>
      {wallet && <p className="balance-inline">Available VEs: <strong>{fmt(wallet.ves)}</strong></p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="card" onSubmit={openConfirmation}>
        <h2>Convert VEs</h2>
        {rates.length === 0 ? <p className="muted">No exchanges are available right now.</p> : (
          <>
            <label>Convert to
              <select value={target} onChange={(event) => setTarget(event.target.value)} required>
                {rates.map((item) => (
                  <option value={item.toCurrency} key={item.rateId}>{LABELS[item.toCurrency]}</option>
                ))}
              </select>
            </label>
            {rate && <p className="rate-note">Rate: {fmt(rate.fromAmount)} VEs → {fmt(rate.toAmount)} {LABELS[rate.toCurrency]}</p>}
            <label>VEs to exchange
              <input type="number" min="1" step="1" max={wallet?.ves} value={amount}
                onChange={(event) => setAmount(event.target.value)} required />
            </label>
            {validAmount && (
              <p className={exactMultiple ? "exchange-preview" : "field-error"}>
                {exactMultiple
                  ? `You will receive ${fmt(outputAmount)} ${LABELS[target]}.`
                  : `Enter a multiple of ${fmt(rate?.fromAmount || 1)} VEs for an exact exchange.`}
              </p>
            )}
            <button className="btn btn-primary" disabled={!rate || !exactMultiple || numericAmount > wallet?.ves}>
              Review exchange
            </button>
          </>
        )}
      </form>
      {confirming && rate && (
        <ConfirmModal title="Confirm exchange" confirmLabel="Exchange" busy={busy}
          onConfirm={submit} onCancel={() => setConfirming(false)}>
          <dl className="summary">
            <dt>Spend</dt><dd>{fmt(numericAmount)} VEs</dd>
            <dt>Receive</dt><dd>{fmt(outputAmount)} {LABELS[target]}</dd>
          </dl>
          <p className="muted">The server checks the current rate and balance before applying both ledger entries.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
        </ConfirmModal>
      )}
    </>
  );
}
