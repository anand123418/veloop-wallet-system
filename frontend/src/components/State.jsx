export function Loading({ label = "Loading…" }) {
  return <div className="state" role="status" aria-live="polite" aria-busy="true">
    <span className="spinner" aria-hidden="true" />{label}
  </div>;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="state state-error" role="alert" aria-live="assertive">
      <p>{message}</p>
      {onRetry && <button type="button" className="btn btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}
