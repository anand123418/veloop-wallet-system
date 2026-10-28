import { useCallback, useRef, useState } from "react";
import DemoAdPlayer from "./DemoAdPlayer.jsx";

export function useDemoAdGate() {
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null);

  const requestDemoAd = useCallback(({ title, onContinue }) => {
    const request = { id: crypto.randomUUID(), title, onContinue };
    pendingRef.current = request;
    setPending(request);
  }, []);

  const continueAction = useCallback(() => {
    const request = pendingRef.current;
    if (!request) return;
    pendingRef.current = null;
    setPending(null);
    request.onContinue();
  }, []);

  const demoAd = pending && (
    <DemoAdPlayer
      key={pending.id}
      durationSeconds={5}
      title={pending.title}
      claimReady
      claimLabel="Continue"
      onClaim={continueAction}
    />
  );

  return { requestDemoAd, demoAd };
}
