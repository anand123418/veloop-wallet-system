import { useEffect, useRef, useState } from "react";
import { useDialogAccessibility } from "./useDialogAccessibility.js";

export default function DemoAdPlayer({
  durationSeconds,
  title,
  onWatched,
  claimReady = false,
  claimLabel = "Continue",
  onClaim,
  busy = false,
  error = "",
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds);
  const dialogRef = useRef(null);
  const onWatchedRef = useRef(onWatched);
  const completed = secondsRemaining === 0;
  const canContinue = completed && claimReady && !busy;

  useDialogAccessibility(dialogRef);
  useEffect(() => { onWatchedRef.current = onWatched; }, [onWatched]);
  useEffect(() => {
    setSecondsRemaining(durationSeconds);
    if (durationSeconds <= 0) {
      onWatchedRef.current?.();
      return undefined;
    }

    let remaining = durationSeconds;
    const timer = window.setInterval(() => {
      remaining -= 1;
      setSecondsRemaining(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(timer);
        onWatchedRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [durationSeconds]);

  return (
    <div className="overlay demo-ad-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-ad-title">
      <section ref={dialogRef} tabIndex={-1} className="demo-ad-player">
        <div className="demo-ad-topline">
          <span>VELOOP DEMO</span>
          <span>{completed ? "VIDEO COMPLETE" : `AD · ${secondsRemaining}s`}</span>
        </div>
        <div className="demo-ad-stage" role="img" aria-label="Animated VELoop rewards advertisement">
          <div className="demo-ad-orbit demo-ad-orbit-one" />
          <div className="demo-ad-orbit demo-ad-orbit-two" />
          <div className="demo-ad-coin">VE</div>
          <div className="demo-ad-copy">
            <span>PLAY. EARN. REPEAT.</span>
            <strong>Rewards<br />move with you.</strong>
            <small>Make every moment count</small>
          </div>
          <div className="demo-ad-wordmark">VELoop<span>✦</span></div>
        </div>
        <div className="demo-ad-details">
          <div>
            <p className="demo-ad-label">DEMO AD · ANIMATED PREVIEW</p>
            <h2 id="demo-ad-title">{title}</h2>
            <p className="demo-ad-description">
              {completed
                ? claimReady ? "Thanks for watching. Your next step is ready." : "Video complete. Finishing the secure reward timer…"
                : "Please keep this demo open until the video finishes."}
            </p>
          </div>
          <div className="demo-ad-progress" role="progressbar" aria-label="Demo video progress"
            aria-valuemin="0" aria-valuemax="100"
            aria-valuenow={Math.floor(((durationSeconds - secondsRemaining) / Math.max(1, durationSeconds)) * 100)}
            aria-valuetext={`${Math.floor(((durationSeconds - secondsRemaining) / Math.max(1, durationSeconds)) * 100)}% complete`}>
            <span style={{ width: `${((durationSeconds - secondsRemaining) / Math.max(1, durationSeconds)) * 100}%` }} />
          </div>
          <button className="btn btn-primary demo-ad-action" onClick={onClaim} disabled={!canContinue} aria-busy={busy}>
            {busy ? "Claiming…" : completed && !claimReady ? "Finishing reward timer…" : completed ? claimLabel : `Please wait · ${secondsRemaining}s`}
          </button>
          {completed && <p className="sr-only" role="status">Demo video complete.</p>}
          {error && <p className="demo-ad-error" role="alert">{error}</p>}
          <p className="demo-ad-disclaimer">Demo only — this is an animated preview, not a verified ad impression.</p>
        </div>
      </section>
    </div>
  );
}
