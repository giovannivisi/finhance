import { describe, expect, it } from "vitest";
import type {
  BrokeragePositionResponse,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

import {
  applyLiveDeltaToSummary,
  computeLiveValueDelta,
  mergeDashboardAssetsWithLiveQuotes,
  mergePositionsWithLiveQuotes,
  recomputeChangeFromLiveTotal,
  resolveHeaderTotal,
  resolvePerformanceTotal,
} from "./live-merge";

function position(
  overrides: Partial<BrokeragePositionResponse>,
): BrokeragePositionResponse {
  return {
    assetId: "asset-1",
    name: "Vanguard FTSE All-World",
    kind: "STOCK",
    ticker: "VWCE",
    exchange: "MIL",
    currency: "USD",
    quantity: 120,
    averageCostPerUnit: 98.5,
    costBasis: 11820,
    currentPrice: 112.4,
    currentValue: 13488,
    unrealisedGainLoss: 1668,
    percentOfBrokerage: 84.9,
    percentOfPortfolio: 33.2,
    targetPercent: 80,
    deltaPercent: 4.9,
    deltaValue: 778,
    valuationSource: "LIVE",
    valuationAsOf: "2026-06-12T09:00:00.000Z",
    isStale: false,
    ...overrides,
  };
}

function quote(
  overrides: Partial<LiveAssetValuationResponse>,
): LiveAssetValuationResponse {
  return {
    assetId: "asset-1",
    price: 113,
    currency: "USD",
    value: 13560,
    valueInReporting: 12500,
    isStale: false,
    ...overrides,
  };
}

function dashboardAsset(
  overrides: Partial<DashboardAssetResponse>,
): DashboardAssetResponse {
  return {
    id: "asset-1",
    name: "Vanguard FTSE All-World",
    type: "ASSET",
    accountId: "acc-broker",
    kind: "STOCK",
    liabilityKind: null,
    ticker: "VWCE",
    exchange: "MIL",
    quantity: 120,
    unitPrice: 112.4,
    balance: 13488,
    currency: "USD",
    notes: null,
    order: 0,
    lastPrice: 112.4,
    lastPriceAt: "2026-06-12T09:00:00.000Z",
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: "Interactive Brokers",
    accountType: "BROKER",
    currentValue: 13488,
    referenceValue: 11820,
    valuationSource: "LIVE",
    valuationAsOf: "2026-06-12T09:00:00.000Z",
    isStale: false,
    ...overrides,
  };
}

describe("mergePositionsWithLiveQuotes", () => {
  it("updates currentPrice, currentValue and unrealisedGainLoss for matched positions", () => {
    const positions = [
      position({
        currency: "USD",
        valuationSource: "LAST_QUOTE",
        valuationAsOf: "2026-06-12T09:00:00.000Z",
        isStale: true,
      }),
    ];
    const quotes = [quote({})];

    const merged = mergePositionsWithLiveQuotes(positions, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "USD",
    });

    // Unit price comes from the asset-currency quote price.
    expect(merged[0]!.currentPrice).toBe(113);
    // Current value comes from the reporting-currency valuation, not the
    // asset-currency `value`.
    expect(merged[0]!.currentValue).toBe(12500);
    // Unrealised P/L is recomputed from the new reporting-currency value.
    expect(merged[0]!.unrealisedGainLoss).toBe(12500 - 11820);
    expect(merged[0]!.valuationSource).toBe("LIVE");
    expect(merged[0]!.valuationAsOf).toBe("2026-06-12T09:05:00.000Z");
    expect(merged[0]!.isStale).toBe(false);
  });

  it("preserves position stale state when FX may still be stale", () => {
    const positions = [
      position({
        currency: "USD",
        valuationSource: "LAST_QUOTE",
        isStale: true,
      }),
    ];
    const quotes = [quote({ currency: "USD", valueInReporting: 12500 })];

    const merged = mergePositionsWithLiveQuotes(positions, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "EUR",
    });

    expect(merged[0]!.currentValue).toBe(12500);
    expect(merged[0]!.valuationSource).toBe("LAST_QUOTE");
    expect(merged[0]!.isStale).toBe(true);
  });

  it("never promotes a persisted stale quote to live", () => {
    const positions = [
      position({ valuationSource: "LAST_QUOTE", isStale: true }),
    ];
    const quotes = [quote({ isStale: true, valueInReporting: 12600 })];

    const merged = mergePositionsWithLiveQuotes(positions, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "USD",
    });

    expect(merged[0]!.currentValue).toBe(12600);
    expect(merged[0]!.valuationSource).toBe("LAST_QUOTE");
    expect(merged[0]!.isStale).toBe(true);
  });

  it("clears cross-currency position stale state when FX is fresh", () => {
    const positions = [
      position({
        currency: "USD",
        valuationSource: "LAST_QUOTE",
        valuationAsOf: "2026-06-12T09:00:00.000Z",
        isStale: true,
      }),
    ];
    const quotes = [quote({ currency: "USD", valueInReporting: 12500 })];

    const merged = mergePositionsWithLiveQuotes(positions, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "EUR",
      hasFreshFx: true,
    });

    expect(merged[0]!.currentValue).toBe(12500);
    expect(merged[0]!.valuationSource).toBe("LIVE");
    expect(merged[0]!.valuationAsOf).toBe("2026-06-12T09:05:00.000Z");
    expect(merged[0]!.isStale).toBe(false);
  });

  it("leaves positions unchanged when there is no matching quote", () => {
    const positions = [position({ assetId: "asset-2" })];
    const quotes = [quote({ assetId: "asset-1" })];

    const merged = mergePositionsWithLiveQuotes(positions, quotes);

    expect(merged[0]).toEqual(positions[0]);
  });

  it("leaves positions unchanged when the currency differs", () => {
    const positions = [position({ currency: "EUR" })];
    const quotes = [quote({ currency: "USD" })];

    const merged = mergePositionsWithLiveQuotes(positions, quotes);

    expect(merged[0]).toEqual(positions[0]);
  });

  it("leaves positions unchanged when the quote has no valueInReporting", () => {
    const positions = [position({})];
    const quotes = [quote({ valueInReporting: null })];

    const merged = mergePositionsWithLiveQuotes(positions, quotes);

    expect(merged[0]).toEqual(positions[0]);
  });

  it("returns a copy when there are no quotes", () => {
    const positions = [position({})];
    const merged = mergePositionsWithLiveQuotes(positions, []);

    expect(merged).toEqual(positions);
    expect(merged).not.toBe(positions);
  });

  it("uses valueInReporting for currentValue when the asset currency differs from the reporting currency", () => {
    const positions = [
      position({ currency: "USD", currentValue: 1100, costBasis: 900 }),
    ];
    const quotes = [
      quote({
        currency: "USD",
        price: 110,
        value: 1100,
        valueInReporting: 1012,
      }),
    ];

    const merged = mergePositionsWithLiveQuotes(positions, quotes);

    expect(merged[0]!.currentValue).toBe(1012);
    expect(merged[0]!.currentPrice).toBe(110);
    expect(merged[0]!.unrealisedGainLoss).toBe(1012 - 900);
  });
});

describe("mergeDashboardAssetsWithLiveQuotes", () => {
  it("updates currentValue and lastPrice for matched assets with a quantity", () => {
    const assets = [
      dashboardAsset({
        currency: "USD",
        valuationSource: "LAST_QUOTE",
        valuationAsOf: "2026-06-12T09:00:00.000Z",
        isStale: true,
      }),
    ];
    const quotes = [quote({})];

    const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "USD",
    });

    // Current value comes from the reporting-currency valuation, not the
    // asset-currency `value`.
    expect(merged[0]!.currentValue).toBe(12500);
    // Last price comes from the asset-currency quote price.
    expect(merged[0]!.lastPrice).toBe(113);
    expect(merged[0]!.valuationSource).toBe("LIVE");
    expect(merged[0]!.valuationAsOf).toBe("2026-06-12T09:05:00.000Z");
    expect(merged[0]!.isStale).toBe(false);
  });

  it("preserves dashboard stale state when FX may still be stale", () => {
    const assets = [
      dashboardAsset({
        currency: "USD",
        valuationSource: "LAST_QUOTE",
        isStale: true,
      }),
    ];
    const quotes = [quote({ currency: "USD", valueInReporting: 12500 })];

    const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "EUR",
    });

    expect(merged[0]!.currentValue).toBe(12500);
    expect(merged[0]!.valuationSource).toBe("LAST_QUOTE");
    expect(merged[0]!.isStale).toBe(true);
  });

  it("clears cross-currency dashboard stale state when FX is fresh", () => {
    const assets = [
      dashboardAsset({
        currency: "USD",
        valuationSource: "LAST_QUOTE",
        valuationAsOf: "2026-06-12T09:00:00.000Z",
        isStale: true,
      }),
    ];
    const quotes = [quote({ currency: "USD", valueInReporting: 12500 })];

    const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes, {
      asOf: "2026-06-12T09:05:00.000Z",
      reportingCurrency: "EUR",
      hasFreshFx: true,
    });

    expect(merged[0]!.currentValue).toBe(12500);
    expect(merged[0]!.valuationSource).toBe("LIVE");
    expect(merged[0]!.valuationAsOf).toBe("2026-06-12T09:05:00.000Z");
    expect(merged[0]!.isStale).toBe(false);
  });

  it("does not update lastPrice for assets without a quantity", () => {
    const assets = [dashboardAsset({ quantity: null, lastPrice: null })];
    const quotes = [quote({})];

    const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

    expect(merged[0]!.currentValue).toBe(12500);
    expect(merged[0]!.lastPrice).toBeNull();
  });

  it("leaves assets unchanged when there is no matching quote", () => {
    const assets = [dashboardAsset({ id: "asset-2" })];
    const merged = mergeDashboardAssetsWithLiveQuotes(assets, [quote({})]);

    expect(merged[0]).toEqual(assets[0]);
  });

  it("leaves the asset unchanged when the quote has no valueInReporting", () => {
    const assets = [dashboardAsset({})];
    const quotes = [quote({ valueInReporting: null })];

    const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

    expect(merged[0]).toEqual(assets[0]);
  });

  it("uses valueInReporting for currentValue when the asset currency differs from the reporting currency", () => {
    const assets = [dashboardAsset({ currency: "USD", currentValue: 1100 })];
    const quotes = [
      quote({
        currency: "USD",
        price: 110,
        value: 1100,
        valueInReporting: 1012,
      }),
    ];

    const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

    expect(merged[0]!.currentValue).toBe(1012);
    expect(merged[0]!.lastPrice).toBe(110);
  });
});

describe("computeLiveValueDelta", () => {
  it("sums reporting-currency deltas for matched assets", () => {
    const previous = [
      quote({ assetId: "a", valueInReporting: 1000 }),
      quote({ assetId: "b", valueInReporting: 500 }),
    ];
    const current = [
      quote({ assetId: "a", valueInReporting: 1010 }),
      quote({ assetId: "b", valueInReporting: 495 }),
    ];

    const result = computeLiveValueDelta(previous, current);

    expect(result.totalValueDelta).toBeCloseTo(5, 5);
    expect(result.matchedCount).toBe(2);
  });

  it("skips assets where the stale reporting value is unknown", () => {
    const previous = [quote({ assetId: "a", valueInReporting: null })];
    const current = [quote({ assetId: "a", valueInReporting: 1010 })];

    const result = computeLiveValueDelta(previous, current);

    expect(result.totalValueDelta).toBe(0);
    expect(result.matchedCount).toBe(0);
  });

  it("skips assets where the current reporting value is unknown", () => {
    const previous = [quote({ assetId: "a", valueInReporting: 1000 })];
    const current = [quote({ assetId: "a", valueInReporting: null })];

    const result = computeLiveValueDelta(previous, current);

    expect(result.totalValueDelta).toBe(0);
    expect(result.matchedCount).toBe(0);
  });

  it("skips assets that only appear in one snapshot", () => {
    const previous = [quote({ assetId: "a", valueInReporting: 1000 })];
    const current = [quote({ assetId: "b", valueInReporting: 500 })];

    const result = computeLiveValueDelta(previous, current);

    expect(result.totalValueDelta).toBe(0);
    expect(result.matchedCount).toBe(0);
  });

  it("returns zero when there is no previous snapshot", () => {
    const result = computeLiveValueDelta(null, [quote({})]);
    expect(result).toEqual({ totalValueDelta: 0, matchedCount: 0 });
  });

  it("can scope deltas to the selected brokerage positions", () => {
    const previous = [
      quote({ assetId: "a", valueInReporting: 1000 }),
      quote({ assetId: "b", valueInReporting: 500 }),
    ];
    const current = [
      quote({ assetId: "a", valueInReporting: 1010 }),
      quote({ assetId: "b", valueInReporting: 550 }),
    ];

    const result = computeLiveValueDelta(previous, current, new Set(["a"]));

    expect(result).toEqual({ totalValueDelta: 10, matchedCount: 1 });
  });
});

describe("applyLiveDeltaToSummary", () => {
  it("applies the delta to totalValue, investedValue and unrealisedGainLoss", () => {
    const summary = {
      totalValue: 15890.5,
      investedValue: 14650.5,
      unrealisedGainLoss: 1830.5,
    };

    const result = applyLiveDeltaToSummary(summary, 25);

    expect(result).toEqual({
      totalValue: 15915.5,
      investedValue: 14675.5,
      unrealisedGainLoss: 1855.5,
    });
  });

  it("returns the same object reference when the delta is zero", () => {
    const summary = {
      totalValue: 100,
      investedValue: 90,
      unrealisedGainLoss: 10,
    };

    expect(applyLiveDeltaToSummary(summary, 0)).toBe(summary);
  });
});

describe("recomputeChangeFromLiveTotal", () => {
  it("computes absolute and percent change from the baseline as a fallback", () => {
    const result = recomputeChangeFromLiveTotal(10130, 10000);

    expect(result).toEqual({ changeAbsolute: 130, changePercent: 1.3 });
  });

  it("applies only the live repricing delta to the cashflow-adjusted P/L", () => {
    const result = recomputeChangeFromLiveTotal(10130, 10000, 10100, 80);

    expect(result?.changeAbsolute).toBe(110);
    expect(result?.changePercent).toBeCloseTo(1.1);
  });

  it("returns null when the baseline is missing or zero", () => {
    expect(recomputeChangeFromLiveTotal(10130, null)).toBeNull();
    expect(recomputeChangeFromLiveTotal(10130, 0)).toBeNull();
  });
});

describe("resolveHeaderTotal", () => {
  it("prefers the live-merged total when fresh", () => {
    const total = resolveHeaderTotal({
      liveTotal: 1000,
      performanceLatestValue: 900,
      workspaceTotalValue: 800,
    });

    expect(total).toBe(1000);
  });

  it("falls back to the performance latest value", () => {
    const total = resolveHeaderTotal({
      liveTotal: null,
      performanceLatestValue: 900,
      workspaceTotalValue: 800,
    });

    expect(total).toBe(900);
  });

  it("falls back to the workspace total value", () => {
    const total = resolveHeaderTotal({
      liveTotal: null,
      performanceLatestValue: null,
      workspaceTotalValue: 800,
    });

    expect(total).toBe(800);
  });
});

describe("resolvePerformanceTotal", () => {
  it("prefers the market-performance latest value and applies live movement", () => {
    expect(
      resolvePerformanceTotal({
        performanceLatestValue: 458,
        investedValue: 458,
        liveValueDelta: 2.5,
      }),
    ).toBe(460.5);
  });

  it("falls back to invested value without pulling in cash", () => {
    expect(
      resolvePerformanceTotal({
        performanceLatestValue: null,
        investedValue: 458,
        liveValueDelta: 2,
      }),
    ).toBe(460);
  });

  it("returns null when no market value is available", () => {
    expect(
      resolvePerformanceTotal({
        performanceLatestValue: null,
        investedValue: null,
      }),
    ).toBeNull();
  });
});
