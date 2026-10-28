import { useCallback, useEffect, useRef } from "react";
import { useDialogAccessibility } from "./useDialogAccessibility.js";

// A confirmation modal is UX only. The backend still validates everything.
export default function ConfirmModal({ title, children, confirmLabel, busy, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  const handleEscape = useCallback(() => {
    if (!busy) onCancelRef.current();
  }, [busy]);
  useDialogAccessibility(dialogRef, handleEscape);

  return (
    <div className="overlay">
      <div className="modal">
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">{title}</h2>
          <div className="modal-body">{children}</div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {busy ? "Submitting…" : confirmLabel}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
