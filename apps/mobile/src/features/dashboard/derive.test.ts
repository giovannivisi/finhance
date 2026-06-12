import { describe, expect, it } from "vitest";
import type { DashboardAssetResponse } from "@finhance/shared";

import { deriveDashboardHoldings, holdingValue } from "./derive";

function asset(
  overrides: Partial<DashboardAssetResponse>,
): DashboardAssetResponse {
  return {
    id: "asset",
    name: "Asset",
    type: "ASSET",
    accountId: null,
    kind: "CASH",
    liabilityKind: null,
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    balance: 100,
    currency: "EUR",
    notes: null,
    order: null,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: null,
    accountType: null,
    currentValue: 100,
    referenceValue: 100,
    valuationSource: "DIRECT_BALANCE",
    valuationAsOf: null,
    isStale: false,
    ...overrides,
  };
}

describe("deriveDashboardHoldings", () => {
  it("groups assets by kind in the preferred order", () => {
    const holdings = deriveDashboardHoldings(
      [
        asset({ id: "1", kind: "STOCK", currentValue: 500 }),
        asset({ id: "2", kind: "CASH", currentValue: 200 }),
        asset({ id: "3", kind: "STOCK", currentValue: 300 }),
      ],
      ["CASH", "STOCK"],
    );

    expect(holdings.assetGroups.map((group) => group.key)).toEqual([
      "CASH",
      "STOCK",
    ]);
    expect(holdings.assetGroups[1]?.total).toBe(800);
  });

  it("separates liabilities and tracks missing values", () => {
    const holdings = deriveDashboardHoldings(
      [
        asset({
          id: "1",
          type: "LIABILITY",
          kind: null,
          liabilityKind: "DEBT",
          currentValue: 900,
        }),
        asset({
          id: "2",
          kind: "CRYPTO",
          currentValue: null,
          referenceValue: null,
        }),
      ],
      [],
    );

    expect(holdings.liabilityGroups).toHaveLength(1);
    expect(holdings.liabilityGroups[0]?.label).toBe("Debt");
    expect(holdings.assetGroups[0]?.hasMissingValues).toBe(true);
    expect(holdings.assetGroups[0]?.total).toBeNull();
  });

  it("prefers live value and falls back to reference", () => {
    expect(holdingValue(asset({ currentValue: 5, referenceValue: 9 }))).toBe(5);
    expect(holdingValue(asset({ currentValue: null, referenceValue: 9 }))).toBe(
      9,
    );
    expect(
      holdingValue(asset({ currentValue: null, referenceValue: null })),
    ).toBeNull();
  });
});
