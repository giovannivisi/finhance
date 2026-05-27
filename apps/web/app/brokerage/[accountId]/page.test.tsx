import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrokerageAccountPage from "@/brokerage/[accountId]/page";

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock("@lib/api", () => ({
  api: apiMock,
}));

vi.mock("@components/BrokeragePageClient", () => ({
  default: ({
    workspace,
  }: {
    workspace: { selectedBroker: { account: { name: string } } };
  }) => (
    <div>Brokerage account client: {workspace.selectedBroker.account.name}</div>
  ),
}));

describe("BrokerageAccountPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("loads the selected brokerage workspace and categories", async () => {
    apiMock
      .mockResolvedValueOnce({
        reportingCurrency: "EUR",
        baseCurrency: "EUR",
        brokers: [],
        selectedBroker: {
          account: {
            id: "broker-1",
            name: "IBKR",
            type: "BROKER",
            currency: "EUR",
            institution: "Broker",
            notes: null,
            order: 1,
            openingBalance: 0,
            openingBalanceDate: null,
            archivedAt: null,
            canDeletePermanently: true,
            deleteBlockReason: null,
            createdAt: "2026-05-19T10:00:00.000Z",
            updatedAt: "2026-05-19T10:00:00.000Z",
          },
          totalValue: 1000,
          cashAvailable: 300,
          investedValue: 700,
          unrealisedGainLoss: 10,
          activePositionCount: 1,
        },
        cashReconciliation: null,
        positions: [],
        activity: [],
        allocation: { assetKindTargets: [], securityTargets: [] },
      })
      .mockResolvedValueOnce([]);

    render(
      await BrokerageAccountPage({
        params: Promise.resolve({ accountId: "broker-1" }),
      }),
    );

    expect(
      await screen.findByText("Brokerage account client: IBKR"),
    ).toBeInTheDocument();
  });
});
