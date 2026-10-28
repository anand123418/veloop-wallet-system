import { useSearchParams } from "react-router-dom";
import Exchange from "./Exchange.jsx";
import Referrals from "./Referrals.jsx";
import Spin from "./Spin.jsx";
import Mining from "./Mining.jsx";
import Games from "./Games.jsx";

const FEATURES = [
  { id: "exchange", label: "Exchange", description: "Move value between currencies", symbol: "⇄", Component: Exchange },
  { id: "referrals", label: "Referrals", description: "Invite friends and earn", symbol: "↗", Component: Referrals },
  { id: "spin", label: "Spin", description: "Try your luck at rewards", symbol: "✳", Component: Spin },
  { id: "mining", label: "Mining", description: "Earn VEs over time", symbol: "⌁", Component: Mining },
  { id: "games", label: "Games", description: "Play a quick challenge", symbol: "◈", Component: Games },
];

export default function Features() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFeature = searchParams.get("tab");
  const selected = FEATURES.find((feature) => feature.id === requestedFeature) || FEATURES[0];
  const ActiveFeature = selected.Component;

  const selectFeature = (id) => {
    setSearchParams({ tab: id }, { replace: false });
  };

  return (
    <section className="features-page">
      <header className="features-header">
        <div className="features-hero-copy">
          <p className="features-eyebrow"><span className="features-eyebrow-dot" /> VELOOP REWARDS</p>
          <h1>More ways to earn.</h1>
          <p className="features-hero-subtitle">Make the most of your wallet with rewards, games, and more.</p>
        </div>
        <div className="features-hero-badge" aria-label="Five wallet features">
          <span className="features-hero-badge-number">05</span>
          <span>WALLET<br />FEATURES</span>
        </div>
      </header>
      <div className="feature-tabs" role="group" aria-label="Choose a wallet feature">
        {FEATURES.map((feature) => (
          <button
            key={feature.id}
            className={`feature-tab ${selected.id === feature.id ? "active" : ""}`}
            type="button"
            aria-pressed={selected.id === feature.id}
            onClick={() => selectFeature(feature.id)}
          >
            <span className="feature-tab-icon" aria-hidden="true">{feature.symbol}</span>
            <span className="feature-tab-copy">
              <span className="feature-tab-label">{feature.label}</span>
              <span className="feature-tab-description">{feature.description}</span>
            </span>
            <span className="feature-tab-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div
        id="feature-panel"
        className="feature-panel"
        aria-live="polite"
      >
        <div className="feature-panel-heading">
          <div>
            <p className="feature-panel-kicker">YOUR WALLET / {selected.label.toUpperCase()}</p>
            <h2>{selected.label}</h2>
          </div>
          <p className="feature-panel-description">{selected.description}</p>
        </div>
        <ActiveFeature />
      </div>
    </section>
  );
}
