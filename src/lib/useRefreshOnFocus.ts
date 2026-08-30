import { useCallback, useEffect, useState } from "react";

/**
 * Runs `load` on mount, whenever the tab becomes visible / regains focus, and on
 * manual trigger. Returns a bump counter + a manual refresh function + a busy
 * flag. `load` should be a stable useCallback.
 */
export function useRefreshOnFocus(load: () => Promise<void> | void) {
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      await load();
    } finally {
      setBusy(false);
      setTick((t) => t + 1);
    }
  }, [load]);

  useEffect(() => {
    run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", run);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return { busy, tick, refresh: run };
}
