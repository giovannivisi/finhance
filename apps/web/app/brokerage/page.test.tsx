import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrokeragePage from "@/brokerage/page";

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
      Brokerage client: {workspace.selectedBroker.account.name} / times{" "}
      {String(showTransactionTimes)}
    </div>
  ),
}));

function buildBroker(id: string, name: string) {
  return {
    account: {
      id,
      name,
      type: "BROKER" as const,
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
  };
}

describe("BrokeragePage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    settingsMock.mockReset();
    settingsMock.mockResolvedValue({ showTransactionTimes: true });
  });

  it("renders an empty state when no active broker accounts exist", async () => {
    apiMock.mockResolvedValueOnce([]);

    render(await BrokeragePage());

    expect(
      screen.getByRole("heading", { name: "Brokerage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No active broker accounts yet."),
    ).toBeInTheDocument();
  });

  it("renders the shared brokerage client directly when exactly one broker account exists", async () => {
    apiMock
      .mockResolvedValueOnce([buildBroker("broker-1", "IBKR")])
      .mockResolvedValueOnce({
        reportingCurrency: "EUR",
        baseCurrency: "EUR",
        brokers: [buildBroker("broker-1", "IBKR")],
        selectedBroker: buildBroker("broker-1", "IBKR"),
        cashReconciliation: null,
        positions: [],
        activity: [],
        allocation: { assetKindTargets: [], securityTargets: [] },
      })
      .mockResolvedValueOnce([]);

    render(await BrokeragePage());

    expect(screen.getByText(/Brokerage client: IBKR/)).toBeInTheDocument();
  });

  it("renders the shared brokerage client when multiple brokers exist", async () => {
    apiMock
      .mockResolvedValueOnce([
        buildBroker("broker-1", "IBKR"),
        buildBroker("broker-2", "Degiro"),
      ])
      .mockResolvedValueOnce({
        reportingCurrency: "EUR",
        baseCurrency: "EUR",
        brokers: [
          buildBroker("broker-1", "IBKR"),
          buildBroker("broker-2", "Degiro"),
        ],
        selectedBroker: buildBroker("broker-1", "IBKR"),
        cashReconciliation: null,
        positions: [],
        activity: [],
        allocation: { assetKindTargets: [], securityTargets: [] },
      })
      .mockResolvedValueOnce([]);

    render(await BrokeragePage());

    expect(screen.getByText(/Brokerage client: IBKR/)).toBeInTheDocument();
  });

  it("renders an inline error instead of a blank page when the initial workspace load fails", async () => {
    apiMock
      .mockResolvedValueOnce([
        buildBroker("broker-1", "IBKR"),
        buildBroker("broker-2", "Degiro"),
      ])
      .mockRejectedValueOnce(
        new Error('Unsupported Yahoo symbol "BAD/TICKER".'),
      );

    render(await BrokeragePage());

    expect(
      screen.getByText("The web app could not reach the API."),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Unsupported Yahoo symbol "BAD/TICKER".'),
    ).toBeInTheDocument();
  });

  it("passes the transaction-time preference to the brokerage client", async () => {
    settingsMock.mockResolvedValue({ showTransactionTimes: false });
    apiMock
      .mockResolvedValueOnce([buildBroker("broker-1", "IBKR")])
      .mockResolvedValueOnce({
        reportingCurrency: "EUR",
        baseCurrency: "EUR",
        brokers: [buildBroker("broker-1", "IBKR")],
        selectedBroker: buildBroker("broker-1", "IBKR"),
        cashReconciliation: null,
        positions: [],
        activity: [],
        allocation: { assetKindTargets: [], securityTargets: [] },
      })
      .mockResolvedValueOnce([]);

    render(await BrokeragePage());

    expect(screen.getByText(/times false/)).toBeInTheDocument();
  });
});
