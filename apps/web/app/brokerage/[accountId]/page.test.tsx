import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrokerageAccountPage from "@/brokerage/[accountId]/page";

const { apiMock, settingsMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  settingsMock: vi.fn(),
}));

vi.mock("@lib/server-api", () => ({
  api: apiMock,
}));

vi.mock("@lib/server-user-settings", () => ({
  getUserSettingsOrDefaults: settingsMock,
}));

vi.mock("@components/BrokeragePageClient", () => ({
  default: ({
    workspace,
    showTransactionTimes,
  }: {
    workspace: { selectedBroker: { account: { name: string } } };
    showTransactionTimes?: boolean;
  }) => (
    <div>
      Brokerage account client: {workspace.selectedBroker.account.name} / times{" "}
      {String(showTransactionTimes)}
    </div>
  ),
}));

describe("BrokerageAccountPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    settingsMock.mockReset();
    settingsMock.mockResolvedValue({ showTransactionTimes: true });
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
      screen.getByText(/Brokerage account client: IBKR/),
    ).toBeInTheDocument();
  });

  it("passes the transaction-time preference to the account client", async () => {
    settingsMock.mockResolvedValue({ showTransactionTimes: false });
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

    expect(screen.getByText(/times false/)).toBeInTheDocument();
  });
});
