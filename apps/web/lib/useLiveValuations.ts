"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { LiveValuationsResponse } from "@finhance/shared";
import { api } from "@lib/api";

const LIVE_VALUATIONS_POLL_INTERVAL_MS = 15_000;

/**
 * Polls `GET /assets/live-valuations` every 15 seconds while the document is
 * visible, pausing the interval (but not clearing it) when the tab is
 * hidden and resuming on return. Overlapping requests are avoided: a tick
 * is skipped entirely if the previous fetch is still in flight.
 */
export function useLiveValuations(): {
  data: LiveValuationsResponse | null;
  error: string | null;
} {
  const [data, setData] = useState<LiveValuationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const poll = useEffectEvent(() => {
    if (document.visibilityState !== "visible" || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    api<LiveValuationsResponse>("/assets/live-valuations")
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to fetch live valuations.",
        );
      })
      .finally(() => {
        isFetchingRef.current = false;
      });
  });

  useEffect(() => {
    poll();
    const intervalId = setInterval(poll, LIVE_VALUATIONS_POLL_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        poll();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { data, error };
}
