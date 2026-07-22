"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { LiveValuationsResponse } from "@finhance/shared";
import { api } from "@lib/api";

/**
 * Reads the latest persisted valuations on mount and when a hidden tab becomes
 * visible again. Price providers are contacted only by the explicit refresh
 * endpoint, so no interval is needed here.
 */
export function useLiveValuations(snapshotKey: string | null = null): {
  data: LiveValuationsResponse | null;
  error: string | null;
} {
  const [snapshot, setSnapshot] = useState<{
    key: string | null;
    data: LiveValuationsResponse | null;
  }>({ key: snapshotKey, data: null });
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<{ key: string | null; id: number } | null>(null);
  const data = snapshot.key === snapshotKey ? snapshot.data : null;

  const poll = useEffectEvent(() => {
    if (
      document.visibilityState !== "visible" ||
      inFlightRef.current?.key === snapshotKey
    ) {
      return;
    }

    const requestId = ++requestIdRef.current;
    inFlightRef.current = { key: snapshotKey, id: requestId };

    api<LiveValuationsResponse>("/assets/live-valuations")
      .then((response) => {
        if (inFlightRef.current?.id !== requestId) {
          return;
        }
        setSnapshot({ key: snapshotKey, data: response });
        setError(null);
      })
      .catch((caught) => {
        if (inFlightRef.current?.id !== requestId) {
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to fetch live valuations.",
        );
      })
      .finally(() => {
        if (inFlightRef.current?.id === requestId) {
          inFlightRef.current = null;
        }
      });
  });

  useEffect(() => {
    poll();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        poll();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [snapshotKey]);

  return { data, error };
}
