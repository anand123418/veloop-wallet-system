import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@veloop.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/wallet", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card login" onSubmit={submit}>
      <div className="login-brand" aria-label="VELoop">
        <span className="login-brand-mark" aria-hidden="true">V</span>
        <span>VELoop</span>
      </div>
      <p className="login-eyebrow">WELCOME BACK</p>
      <h1>Sign in to your wallet</h1>
      <p className="login-description">Your wallet, rewards, and activity are all in one place.</p>
      <p className="login-demo"><strong>Demo account</strong><br />demo@veloop.test <span>·</span> Password from your seed script</p>
      <label>Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username"
          aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
      </label>
      <label>Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
          aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
      </label>
      {error && <p id="login-error" className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="muted auth-link">New here? <Link to="/register">Create an account</Link></p>
    </form>
  );
}
