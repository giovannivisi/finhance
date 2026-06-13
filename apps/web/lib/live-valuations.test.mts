import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLiveDeltasToKindTotals,
  applyLiveDeltasToSummary,
  applyLiveValueDelta,
  computeDashboardLiveValueDeltas,
  computeLiveChangePercent,
  computeLiveValueDelta,
  mergeDashboardAssetsWithLiveQuotes,
  mergeLiveDashboardAssets,
  mergeLivePositions,
  sumDashboardValuesWithLiveDeltas,
} from "./live-valuations.ts";
import type {
  BrokeragePositionResponse,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

function buildPosition(
  overrides: Partial<BrokeragePositionResponse> = {},
): BrokeragePositionResponse {
  return {
    assetId: "asset-1",
    name: "VWCE",
    kind: "STOCK",
    ticker: "VWCE",
    exchange: "XETRA",
    currency: "EUR",
    quantity: 10,
    averageCostPerUnit: 50,
    costBasis: 500,
    currentPrice: 55,
    currentValue: 550,
    unrealisedGainLoss: 50,
    percentOfBrokerage: 100,
    percentOfPortfolio: 100,
    targetPercent: null,
    deltaPercent: null,
    deltaValue: null,
    valuationSource: "LIVE",
    valuationAsOf: "2026-06-12T08:00:00.000Z",
    isStale: false,
    ...overrides,
  };
}

function buildQuote(
  overrides: Partial<LiveAssetValuationResponse> = {},
): LiveAssetValuationResponse {
  return {
    assetId: "asset-1",
    price: 56,
    currency: "EUR",
    value: 560,
    valueInReporting: 560,
    ...overrides,
  };
}

function buildDashboardAsset(
  overrides: Partial<DashboardAssetResponse> = {},
): DashboardAssetResponse {
  return {
    id: "asset-1",
    name: "VWCE",
    type: "ASSET",
    accountId: "broker-1",
    kind: "STOCK",
    liabilityKind: null,
    ticker: "VWCE",
    exchange: "XETRA",
    quantity: 10,
    unitPrice: 50,
    balance: 500,
    currency: "EUR",
    notes: null,
    order: 1,
    lastPrice: 55,
    lastPriceAt: "2026-06-12T08:00:00.000Z",
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: "IBKR",
    accountType: "BROKER",
    currentValue: 550,
    referenceValue: 500,
    valuationSource: "LIVE",
    valuationAsOf: "2026-06-12T08:00:00.000Z",
    isStale: false,
    ...overrides,
  };
}

test("mergeLivePositions replaces price, value and P/L for matched positions", () => {
  const positions = [buildPosition()];
  const quotes = [buildQuote({ value: 1120, valueInReporting: 560 })];

  const merged = mergeLivePositions(positions, quotes);

  // Unit price comes from the asset-currency quote price.
  assert.equal(merged[0].currentPrice, 56);
  // Current value comes from the reporting-currency valuation, not the
  // asset-currency `value`.
  assert.equal(merged[0].currentValue, 560);
  // Unrealised P/L is recomputed from the new reporting-currency value.
  assert.equal(merged[0].unrealisedGainLoss, 560 - positions[0].costBasis);
  // Unrelated fields are preserved.
  assert.equal(merged[0].quantity, 10);
});

test("mergeLivePositions leaves unmatched positions untouched", () => {
  const positions = [buildPosition({ assetId: "asset-2" })];
  const quotes = [buildQuote({ assetId: "asset-1" })];

  const merged = mergeLivePositions(positions, quotes);

  assert.deepEqual(merged, positions);
});

test("mergeLivePositions leaves positions with no valueInReporting untouched", () => {
  const positions = [buildPosition()];
  const quotes = [buildQuote({ valueInReporting: null })];

  const merged = mergeLivePositions(positions, quotes);

  assert.deepEqual(merged, positions);
});

test("mergeLivePositions returns the same array reference when there are no quotes", () => {
  const positions = [buildPosition()];

  assert.equal(mergeLivePositions(positions, []), positions);
});

test("mergeLiveDashboardAssets replaces currentValue with valueInReporting", () => {
  const assets = [buildDashboardAsset()];
  const quotes = [buildQuote({ valueInReporting: 575 })];

  const merged = mergeLiveDashboardAssets(assets, quotes);

  assert.equal(merged[0].currentValue, 575);
});

test("mergeLiveDashboardAssets skips quotes with a null valueInReporting", () => {
  const assets = [buildDashboardAsset()];
  const quotes = [buildQuote({ valueInReporting: null })];

  const merged = mergeLiveDashboardAssets(assets, quotes);

  assert.equal(merged[0].currentValue, 550);
});

test("computeLiveValueDelta sums reporting-currency deltas for matched positions", () => {
  const positions = [
    buildPosition({ assetId: "asset-1", currentValue: 550 }),
    buildPosition({ assetId: "asset-2", currentValue: 200 }),
  ];
  const quotes = [
    buildQuote({ assetId: "asset-1", valueInReporting: 560 }),
    buildQuote({ assetId: "asset-2", valueInReporting: 190 }),
  ];

  const delta = computeLiveValueDelta(positions, quotes);

  assert.equal(delta, 10 + -10);
});

test("computeLiveValueDelta skips positions with a null valueInReporting quote", () => {
  const positions = [buildPosition({ assetId: "asset-1", currentValue: 550 })];
  const quotes = [buildQuote({ assetId: "asset-1", valueInReporting: null })];

  assert.equal(computeLiveValueDelta(positions, quotes), 0);
});

test("computeLiveValueDelta skips positions with an unknown stale reporting value", () => {
  const positions = [buildPosition({ assetId: "asset-1", currentValue: null })];
  const quotes = [buildQuote({ assetId: "asset-1", valueInReporting: 560 })];

  assert.equal(computeLiveValueDelta(positions, quotes), 0);
});

test("applyLiveValueDelta shifts totalValue, investedValue, and unrealisedGainLoss by the same delta", () => {
  const summary = {
    totalValue: 1000,
    cashAvailable: 100,
    investedValue: 900,
    unrealisedGainLoss: 50,
    activePositionCount: 1,
  };

  const result = applyLiveValueDelta(summary, 25);

  assert.equal(result.totalValue, 1025);
  assert.equal(result.investedValue, 925);
  assert.equal(result.unrealisedGainLoss, 75);
  // Unrelated fields are preserved.
  assert.equal(result.cashAvailable, 100);
  assert.equal(result.activePositionCount, 1);
});

test("applyLiveValueDelta returns the same object reference when the delta is zero", () => {
  const summary = {
    totalValue: 1000,
    investedValue: 900,
    unrealisedGainLoss: 50,
  };

  assert.equal(applyLiveValueDelta(summary, 0), summary);
});

test("computeLiveChangePercent recomputes the change against the baseline", () => {
  assert.equal(computeLiveChangePercent(1100, 1000), 10);
  assert.equal(computeLiveChangePercent(950, 1000), -5);
});

test("computeLiveChangePercent returns null when the baseline is missing or zero", () => {
  assert.equal(computeLiveChangePercent(1100, null), null);
  assert.equal(computeLiveChangePercent(1100, 0), null);
});

test("mergeDashboardAssetsWithLiveQuotes updates currentValue and lastPrice for matched assets with a quantity", () => {
  const assets = [buildDashboardAsset()];
  const quotes = [buildQuote({ price: 56, value: 560 })];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

  assert.equal(merged[0].currentValue, 560);
  assert.equal(merged[0].lastPrice, 56);
});

test("mergeDashboardAssetsWithLiveQuotes does not update lastPrice for assets without a quantity", () => {
  const assets = [buildDashboardAsset({ quantity: null, lastPrice: null })];
  const quotes = [buildQuote({ price: 56, value: 560 })];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

  assert.equal(merged[0].currentValue, 560);
  assert.equal(merged[0].lastPrice, null);
});

test("mergeDashboardAssetsWithLiveQuotes leaves unmatched assets unchanged", () => {
  const assets = [buildDashboardAsset({ id: "asset-2" })];
  const quotes = [buildQuote({ assetId: "asset-1" })];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

  assert.deepEqual(merged, assets);
});

test("mergeDashboardAssetsWithLiveQuotes leaves the row unchanged on a currency mismatch", () => {
  const assets = [buildDashboardAsset({ currency: "EUR" })];
  const quotes = [buildQuote({ currency: "USD" })];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

  assert.deepEqual(merged, assets);
});

test("mergeDashboardAssetsWithLiveQuotes leaves the row unchanged when the quote has no valueInReporting", () => {
  const assets = [buildDashboardAsset()];
  const quotes = [
    buildQuote({ price: 56, value: 560, valueInReporting: null }),
  ];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

  assert.deepEqual(merged, assets);
});

test("mergeDashboardAssetsWithLiveQuotes uses valueInReporting for currentValue when the asset currency differs from the reporting currency", () => {
  const assets = [buildDashboardAsset({ currency: "USD", currentValue: 1100 })];
  const quotes = [
    buildQuote({
      currency: "USD",
      price: 110,
      value: 1100,
      valueInReporting: 1012,
    }),
  ];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, quotes);

  assert.equal(merged[0].currentValue, 1012);
  assert.equal(merged[0].lastPrice, 110);
});

test("mergeDashboardAssetsWithLiveQuotes returns a copy when there are no quotes", () => {
  const assets = [buildDashboardAsset()];

  const merged = mergeDashboardAssetsWithLiveQuotes(assets, []);

  assert.deepEqual(merged, assets);
  assert.notEqual(merged, assets);
});

test("computeDashboardLiveValueDeltas computes the delta against currentValue", () => {
  const assets = [buildDashboardAsset({ currentValue: 550 })];
  const quotes = [buildQuote({ valueInReporting: 575 })];

  const deltas = computeDashboardLiveValueDeltas(assets, quotes);

  assert.equal(deltas.get("asset-1"), 25);
});

test("computeDashboardLiveValueDeltas falls back to referenceValue when currentValue is null", () => {
  const assets = [
    buildDashboardAsset({ currentValue: null, referenceValue: 500 }),
  ];
  const quotes = [buildQuote({ valueInReporting: 530 })];

  const deltas = computeDashboardLiveValueDeltas(assets, quotes);

  assert.equal(deltas.get("asset-1"), 30);
});

test("computeDashboardLiveValueDeltas omits assets with a null valueInReporting", () => {
  const assets = [buildDashboardAsset({ currentValue: 550 })];
  const quotes = [buildQuote({ valueInReporting: null })];

  const deltas = computeDashboardLiveValueDeltas(assets, quotes);

  assert.equal(deltas.has("asset-1"), false);
});

test("computeDashboardLiveValueDeltas omits assets without a matching quote", () => {
  const assets = [buildDashboardAsset({ id: "asset-2", currentValue: 550 })];
  const quotes = [buildQuote({ assetId: "asset-1" })];

  const deltas = computeDashboardLiveValueDeltas(assets, quotes);

  assert.equal(deltas.size, 0);
});

test("applyLiveDeltasToKindTotals adds matched ASSET deltas to the corresponding kind total", () => {
  const assets = [
    buildDashboardAsset({ id: "asset-1", kind: "STOCK", currentValue: 550 }),
    buildDashboardAsset({ id: "asset-2", kind: "CASH", currentValue: 200 }),
  ];
  const deltas = new Map([
    ["asset-1", 25],
    ["asset-2", -5],
  ]);
  const kindTotalsArray = [
    { kind: "STOCK", total: 550 },
    { kind: "CASH", total: 200 },
  ];

  const result = applyLiveDeltasToKindTotals(kindTotalsArray, assets, deltas);

  assert.deepEqual(result, [
    { kind: "STOCK", total: 575 },
    { kind: "CASH", total: 195 },
  ]);
});

test("applyLiveDeltasToKindTotals returns equivalent totals when there are no deltas", () => {
  const assets = [buildDashboardAsset({ kind: "STOCK", currentValue: 550 })];
  const kindTotalsArray = [{ kind: "STOCK", total: 550 }];

  const result = applyLiveDeltasToKindTotals(
    kindTotalsArray,
    assets,
    new Map(),
  );

  assert.deepEqual(result, kindTotalsArray);
  assert.notEqual(result, kindTotalsArray);
});

test("applyLiveDeltasToSummary moves the assets total and net worth for an ASSET delta", () => {
  const assets = [
    buildDashboardAsset({ id: "asset-1", type: "ASSET", currentValue: 550 }),
  ];
  const deltas = new Map([["asset-1", 25]]);
  const summary = { assets: 550, liabilities: 100, netWorth: 450 };

  const result = applyLiveDeltasToSummary(summary, assets, deltas);

  assert.deepEqual(result, { assets: 575, liabilities: 100, netWorth: 475 });
});

test("applyLiveDeltasToSummary moves the liabilities total and net worth (opposite sign) for a LIABILITY delta", () => {
  const assets = [
    buildDashboardAsset({
      id: "liability-1",
      type: "LIABILITY",
      kind: null,
      liabilityKind: "DEBT",
      currentValue: 100,
    }),
  ];
  const deltas = new Map([["liability-1", 10]]);
  const summary = { assets: 550, liabilities: 100, netWorth: 450 };

  const result = applyLiveDeltasToSummary(summary, assets, deltas);

  assert.deepEqual(result, { assets: 550, liabilities: 110, netWorth: 440 });
});

test("applyLiveDeltasToSummary returns the same object reference when there are no deltas", () => {
  const assets = [buildDashboardAsset({ currentValue: 550 })];
  const summary = { assets: 550, liabilities: 100, netWorth: 450 };

  assert.equal(applyLiveDeltasToSummary(summary, assets, new Map()), summary);
});

test("applyLiveDeltasToSummary leaves aggregates unchanged when a quote has a null valueInReporting", () => {
  const assets = [buildDashboardAsset({ id: "asset-1", currentValue: 550 })];
  const quotes = [buildQuote({ assetId: "asset-1", valueInReporting: null })];
  const deltas = computeDashboardLiveValueDeltas(assets, quotes);
  const summary = { assets: 550, liabilities: 100, netWorth: 450 };

  const result = applyLiveDeltasToSummary(summary, assets, deltas);

  assert.deepEqual(result, summary);
});

test("sumDashboardValuesWithLiveDeltas sums baseline values adjusted by matching deltas", () => {
  const assets = [
    buildDashboardAsset({ id: "asset-1", currentValue: 550 }),
    buildDashboardAsset({ id: "asset-2", currentValue: 200 }),
  ];
  const deltas = new Map([["asset-1", 25]]);

  assert.equal(sumDashboardValuesWithLiveDeltas(assets, deltas), 775);
});

test("sumDashboardValuesWithLiveDeltas falls back to referenceValue and balance", () => {
  const assets = [
    buildDashboardAsset({
      id: "asset-1",
      currentValue: null,
      referenceValue: 500,
    }),
    buildDashboardAsset({
      id: "asset-2",
      currentValue: null,
      referenceValue: null,
      balance: 80,
    }),
  ];

  assert.equal(sumDashboardValuesWithLiveDeltas(assets, new Map()), 580);
});
