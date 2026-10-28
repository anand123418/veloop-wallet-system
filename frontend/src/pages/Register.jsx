import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(email.trim(), name.trim(), password, referralCode.trim());
      navigate("/wallet", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card login" onSubmit={submit}>
      <h1>Create your wallet account</h1>
      <p className="muted">An account lets you earn rewards and manage your wallet.</p>
      <label>Name
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="name"
          aria-invalid={Boolean(error)} aria-describedby={error ? "register-error" : undefined} />
      </label>
      <label>Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email"
          aria-invalid={Boolean(error)} aria-describedby={error ? "register-error" : undefined} />
      </label>
      <label>Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password"
          aria-invalid={Boolean(error)} aria-describedby={error ? "register-error" : undefined} />
      </label>
      <label>Referral code <span className="muted">(optional)</span>
        <input value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} maxLength={20} autoComplete="off"
          aria-invalid={Boolean(error)} aria-describedby={error ? "register-error" : undefined} />
      </label>
      {error && <p id="register-error" className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? "Creating account…" : "Create account"}</button>
      <p className="muted auth-link">Already registered? <Link to="/login">Sign in</Link></p>
    </form>
  );
}
