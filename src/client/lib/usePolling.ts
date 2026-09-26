import { useEffect, useRef, useState } from "react";
import type { Result } from "../../shared/rpcTypes";

export function usePolling<T>(
  fetcher: () => Promise<Result<T>>,
  intervalMs: number,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  fetcherRef.current = fetcher;
  useEffect(() => {
    let cancelled = false;
    let active = false;
    let timeout: ReturnType<typeof setTimeout>;
    setData(null);
    setLoading(true);
    setError(null);
    async function tick() {
      if (active || cancelled) return;
      active = true;
      try {
        const result = await fetcherRef.current();
        if (cancelled) return;
        if (result.ok) {
          setData(result.data);
          setError(null);
        } else setError(result.description);
        setLoading(false);
      } finally {
        active = false;
      }
    }
    async function poll() {
      if (document.visibilityState === "visible") await tick();
      if (!cancelled) timeout = setTimeout(poll, intervalMs);
    }
    refreshRef.current = tick;
    void tick();
    timeout = setTimeout(poll, intervalMs);
    const visible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", visible);
    };
    // Fetch identity is updated in a ref; only resource keys restart this subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
  return { data, loading, error, refetch: () => refreshRef.current() };
}
