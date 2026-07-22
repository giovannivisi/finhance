import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveValuationsResponse } from "@finhance/shared";
import { api } from "@lib/api";
import { useLiveValuations } from "@lib/useLiveValuations";

vi.mock("@lib/api", () => ({ api: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function valuation(asOf: string, price: number): LiveValuationsResponse {
  return {
    asOf,
    reportingCurrency: "EUR",
    quotes: [
      {
        assetId: "asset-1",
        price,
        currency: "EUR",
        value: price,
        valueInReporting: price,
        asOf,
        isStale: false,
      },
    ],
  };
}

describe("useLiveValuations", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it("ignores an older in-flight snapshot after the persisted refresh key changes", async () => {
    const older = deferred<LiveValuationsResponse>();
    const newer = deferred<LiveValuationsResponse>();
    vi.mocked(api)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const { result, rerender } = renderHook(
      ({ snapshotKey }) => useLiveValuations(snapshotKey),
      { initialProps: { snapshotKey: "2026-07-22T10:00:00.000Z" } },
    );

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    rerender({ snapshotKey: "2026-07-22T10:05:00.000Z" });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));

    await act(async () => {
      older.resolve(valuation("2026-07-22T10:00:00.000Z", 100));
      await older.promise;
    });
    expect(result.current.data).toBeNull();

    await act(async () => {
      newer.resolve(valuation("2026-07-22T10:05:00.000Z", 110));
      await newer.promise;
    });
    expect(result.current.data?.quotes[0]?.price).toBe(110);
  });
});
