import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Wallet from "./pages/Wallet.jsx";
import Payout from "./pages/Payout.jsx";
import Features from "./pages/Features.jsx";

function Protected({ children }) {
  const { authed } = useAuth();
  return authed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { authed, logout } = useAuth();
  const location = useLocation();
  return (
    <>
      {authed && (
        <header className="topbar">
          <span className="brand">VELoop</span>
          <nav aria-label="Main navigation">
            <NavLink to="/wallet">Wallet</NavLink>
            <NavLink to="/payout">Payout</NavLink>
            <NavLink to="/features">Features</NavLink>
          </nav>
          <button type="button" className="btn btn-ghost" onClick={logout}>Log out</button>
        </header>
      )}
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main id="main-content" tabIndex={-1} className={`page ${location.pathname === "/features" ? "page-features" : ""} ${location.pathname === "/wallet" ? "page-wallet" : ""} ${location.pathname === "/payout" ? "page-payout" : ""} ${location.pathname === "/login" ? "page-login" : ""} ${location.pathname === "/register" ? "page-register" : ""}`}>
        <Routes>
          <Route path="/login" element={authed ? <Navigate to="/wallet" replace /> : <Login />} />
          <Route path="/register" element={authed ? <Navigate to="/wallet" replace /> : <Register />} />
          <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
          <Route path="/payout" element={<Protected><Payout /></Protected>} />
          <Route path="/features" element={<Protected><Features /></Protected>} />
          <Route path="/exchange" element={<Navigate to="/features?tab=exchange" replace />} />
          <Route path="/referrals" element={<Navigate to="/features?tab=referrals" replace />} />
          <Route path="/spin" element={<Navigate to="/features?tab=spin" replace />} />
          <Route path="/mining" element={<Navigate to="/features?tab=mining" replace />} />
          <Route path="/games" element={<Navigate to="/features?tab=games" replace />} />
          <Route path="*" element={<Navigate to={authed ? "/wallet" : "/login"} replace />} />
        </Routes>
      </main>
    </>
  );
}
