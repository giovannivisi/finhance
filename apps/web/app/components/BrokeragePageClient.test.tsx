import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrokerageWorkspaceResponse } from "@finhance/shared";
import BrokeragePageClient from "@components/BrokeragePageClient";
import { api, apiMutation } from "@lib/api";
import { requestDashboardRefresh } from "@lib/dashboard-refresh";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const prefetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
    prefetch: prefetchMock,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@components/ThemeProvider", () => ({
  useAppPreferences: () => ({
    hideMoney: false,
    isHydrated: true,
  }),
}));

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
  api: vi.fn(),
}));

vi.mock("@lib/dashboard-refresh", () => ({
  getDashboardRefreshNotice: vi.fn(),
  requestDashboardRefresh: vi.fn(),
}));

vi.mock("@components/Modal", () => ({
  default: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

function buildWorkspace(): BrokerageWorkspaceResponse {
  return {
    reportingCurrency: "EUR",
    baseCurrency: "EUR",
    pricingStatus: {
      state: "FRESH" as "FRESH" | "STALE" | "PARTIAL",
      refreshSuggested: false,
      hasStaleQuotes: false,
      hasStaleFx: false,
      hasMissingFx: false,
    },
    lastRefreshAt: "2026-05-19T10:00:00.000Z",
    brokers: [
      {
        account: {
          id: "broker-1",
          name: "IBKR",
          type: "BROKER" as const,
          currency: "EUR",
          institution: "Interactive Brokers",
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
        totalValue: 1500,
        cashAvailable: 900,
        investedValue: 600,
        unrealisedGainLoss: 20,
        activePositionCount: 1,
      },
      {
        account: {
          id: "broker-2",
          name: "Degiro",
          type: "BROKER" as const,
          currency: "EUR",
          institution: "Degiro",
          notes: null,
          order: 2,
          openingBalance: 0,
          openingBalanceDate: null,
          archivedAt: null,
          canDeletePermanently: true,
          deleteBlockReason: null,
          createdAt: "2026-05-19T10:00:00.000Z",
          updatedAt: "2026-05-19T10:00:00.000Z",
        },
        totalValue: 1200,
        cashAvailable: 500,
        investedValue: 700,
        unrealisedGainLoss: -5,
        activePositionCount: 2,
      },
    ],
    selectedBroker: {
      account: {
        id: "broker-1",
        name: "IBKR",
        type: "BROKER" as const,
        currency: "EUR",
        institution: "Interactive Brokers",
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
      totalValue: 1500,
      cashAvailable: 900,
      investedValue: 600,
      unrealisedGainLoss: 20,
      activePositionCount: 1,
    },
    cashReconciliation: {
      status: "CLEAN" as const,
      accountId: "broker-1",
      accountName: "IBKR",
      accountType: "BROKER" as const,
      currency: "EUR",
      reconciliationScope: "CASH_ONLY" as const,
      baselineMode: "FULL_HISTORY" as const,
      trackedBalance: 900,
      expectedBalance: 900,
      delta: 0,
      assetCount: 2,
      transactionCount: 4,
      issueCodes: [],
      diagnostics: [],
      canCreateAdjustment: false,
      canEstablishOpeningBalanceBaseline: false,
      openingBalanceBaselineGuidance: null,
      adjustmentGuidance: {
        status: "SAFE" as const,
        message: "No action needed.",
      },
    },
    positions: [
      {
        assetId: "asset-stock",
        name: "VWCE",
        kind: "STOCK" as const,
        ticker: "VWCE",
        exchange: "XETRA",
        currency: "EUR",
        quantity: 12,
        averageCostPerUnit: 50,
        costBasis: 600,
        currentPrice: 55,
        currentValue: 660,
        unrealisedGainLoss: 60,
        percentOfBrokerage: 44,
        percentOfPortfolio: 20,
        targetPercent: 25,
        deltaPercent: 5,
        deltaValue: 100,
        valuationSource: "LIVE" as const,
        valuationAsOf: "2026-05-19T10:00:00.000Z",
        isStale: false,
      },
    ],
    activity: [
      {
        id: "op-1",
        source: "BROKERAGE_OPERATION" as const,
        kind: "BUY",
        postedAt: "2026-05-19T10:00:00.000Z",
        title: "Buy",
        detail: "VWCE",
        amount: -101,
        currency: "EUR",
        notes: null,
        assetId: "asset-stock",
        assetName: "VWCE",
        quantity: 2,
        unitPrice: 50,
        feeAmount: 1,
        transactionId: null,
      },
      {
        id: "txn-1",
        source: "TRANSACTION" as const,
        kind: "INCOME",
        postedAt: "2026-05-10T08:00:00.000Z",
        title: "Dividend mirrored transaction",
        detail: "Dividends",
        amount: 12.5,
        currency: "EUR",
        notes: null,
        assetId: "asset-stock",
        assetName: "VWCE",
        quantity: null,
        unitPrice: null,
        feeAmount: null,
        transactionId: "transaction-1",
      },
      {
        id: "op-2",
        source: "BROKERAGE_OPERATION" as const,
        kind: "SELL",
        postedAt: "2026-04-15T10:00:00.000Z",
        title: "Sell",
        detail: "VWCE",
        amount: 220,
        currency: "EUR",
        notes: null,
        assetId: "asset-stock",
        assetName: "VWCE",
        quantity: 4,
        unitPrice: 55,
        feeAmount: 0,
        transactionId: null,
      },
    ],
    allocation: {
      assetKindTargets: [
        {
          key: "CASH",
          label: "Cash",
          kind: "CASH" as const,
          ticker: null,
          exchange: null,
          currentValue: 900,
          currentPercent: 60,
          targetPercent: 40,
          deltaPercent: -20,
          deltaValue: -300,
        },
        {
          key: "STOCK",
          label: "Stocks",
          kind: "STOCK" as const,
          ticker: null,
          exchange: null,
          currentValue: 660,
          currentPercent: 44,
          targetPercent: 60,
          deltaPercent: 16,
          deltaValue: 240,
        },
      ],
      securityTargets: [
        {
          key: "STOCK:VWCE:XETRA",
          label: "VWCE",
          kind: "STOCK" as const,
          ticker: "VWCE",
          exchange: "XETRA",
          currentValue: 660,
          currentPercent: 44,
          targetPercent: 100,
          deltaPercent: 56,
          deltaValue: 840,
        },
      ],
    },
  };
}

function buildWorkspaceWithoutPositions(): BrokerageWorkspaceResponse {
  const workspace = buildWorkspace();
  return {
    ...workspace,
    positions: [],
    selectedBroker: {
      ...workspace.selectedBroker,
      activePositionCount: 0,
    },
  };
}

const categories = [
  {
    id: "income-dividend",
    name: "Dividends",
    type: "INCOME" as const,
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 1,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-19T10:00:00.000Z",
    updatedAt: "2026-05-19T10:00:00.000Z",
  },
  {
    id: "expense-broker-fee",
    name: "Broker fees",
    type: "EXPENSE" as const,
    parentCategoryId: "primary-investing",
    parentCategoryName: "Investing",
    isPrimary: false,
    isSecondary: true,
    order: 2,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-19T10:00:00.000Z",
    updatedAt: "2026-05-19T10:00:00.000Z",
  },
];

const PERFORMANCE_PRICING_STATUS = {
  state: "FRESH" as const,
  refreshSuggested: false,
  hasStaleQuotes: false,
  hasStaleFx: false,
  hasMissingFx: false,
};

function buildPerformanceResponse() {
  return {
    range: "1D" as const,
    reportingCurrency: "EUR",
    pricingStatus: PERFORMANCE_PRICING_STATUS,
    points: [
      { t: Date.UTC(2026, 5, 12, 8, 0), value: 1480 },
      { t: Date.UTC(2026, 5, 12, 16, 0), value: 1500 },
    ],
    baselineValue: 1480,
    latestValue: 1500,
    changeAbsolute: 20,
    changePercent: (20 / 1480) * 100,
    asOf: "2026-06-12T16:00:00.000Z",
  };
}

function buildLiveValuationsResponse() {
  return {
    asOf: "2026-06-12T16:00:00.000Z",
    reportingCurrency: "EUR",
    quotes: [],
  };
}

describe("BrokeragePageClient", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    prefetchMock.mockReset();
    vi.mocked(apiMutation).mockReset();
    vi.mocked(requestDashboardRefresh).mockReset();
    vi.mocked(requestDashboardRefresh).mockResolvedValue({
      ok: true,
      refreshedAt: "2026-05-19T10:01:00.000Z",
      warning: null,
    });
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/performance")) {
        return Promise.resolve(buildPerformanceResponse());
      }
      if (path.includes("/assets/live-valuations")) {
        return Promise.resolve(buildLiveValuationsResponse());
      }
      return Promise.reject(new Error(`Unexpected api call: ${path}`));
    });
  });

  it("renders the brokerage workspace and routes account switching through the deep link", async () => {
    const user = userEvent.setup();

    render(
      <BrokeragePageClient
        workspace={buildWorkspace()}
        categories={categories}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Brokerage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cash reconciliation")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("Broker account"),
      "broker-2",
    );

    expect(pushMock).toHaveBeenCalledWith("/brokerage/broker-2");
  });

  it("records a dividend through the dedicated brokerage endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(apiMutation).mockResolvedValue(undefined);

    render(
      <BrokeragePageClient
        workspace={buildWorkspace()}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Operations" }));
    await user.click(screen.getByRole("menuitem", { name: "Dividend" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Record dividend",
    });
    await user.selectOptions(
      within(dialog).getByLabelText("Holding"),
      "asset-stock",
    );
    await user.type(within(dialog).getByLabelText("Amount"), "12.5");
    await user.selectOptions(
      within(dialog).getByLabelText("Category"),
      "income-dividend",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Record dividend" }),
    );

    expect(apiMutation).toHaveBeenCalledTimes(1);
    const dividendCall = vi.mocked(apiMutation).mock.calls[0];
    expect(dividendCall).toBeDefined();
    const path = dividendCall![0];
    const request = dividendCall![1]!;
    expect(path).toBe("/brokerage/broker-1/dividend");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toMatchObject({
      assetId: "asset-stock",
      amount: 12.5,
      categoryId: "income-dividend",
      notes: null,
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("renders the operations menu with Cash activity and keeps Sell disabled when no holdings exist", async () => {
    const user = userEvent.setup();

    render(
      <BrokeragePageClient
        workspace={buildWorkspaceWithoutPositions()}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Operations" }));

    const menu = screen.getByRole("menu", { name: "Operations" });
    expect(within(menu).getByRole("menuitem", { name: "Sell" })).toBeDisabled();
    expect(
      within(menu).getByRole("menuitem", { name: "Cash activity" }),
    ).toHaveAttribute("href", "/transactions?accountId=broker-1");
  });

  it("blocks invalid target totals before calling the API", async () => {
    const user = userEvent.setup();

    render(
      <BrokeragePageClient
        workspace={buildWorkspace()}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit targets" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Edit allocation targets",
    });
    const stockInput = within(dialog).getByDisplayValue("60");
    await user.clear(stockInput);
    await user.type(stockInput, "50");
    await user.click(
      within(dialog).getByRole("button", { name: "Save targets" }),
    );

    expect(
      await within(dialog).findByText("Asset-class targets must sum to 100%."),
    ).toBeInTheDocument();
    expect(apiMutation).not.toHaveBeenCalled();
  });

  it("supports turning a target row off and excludes it from the saved payload", async () => {
    const user = userEvent.setup();
    vi.mocked(apiMutation).mockResolvedValue(undefined);

    render(
      <BrokeragePageClient
        workspace={buildWorkspace()}
        categories={categories}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit targets" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Edit allocation targets",
    });

    expect(
      within(dialog).getByText((content, node) => {
        return (
          node?.textContent === "Current total 100.00%" &&
          content.includes("Current total")
        );
      }),
    ).toBeInTheDocument();

    const cashRowInput = within(dialog).getByLabelText("Cash target percent");
    const cashToggleGroup = within(dialog).getByRole("group", {
      name: "Cash target enabled",
    });
    const stockInput = within(dialog).getByLabelText("Stocks target percent");

    await user.click(
      within(cashToggleGroup).getByRole("button", { name: "Off" }),
    );
    expect(cashRowInput).toBeDisabled();
    expect(
      within(dialog).getByText((content, node) => {
        return (
          node?.textContent === "Current total 60.00%" &&
          content.includes("Current total")
        );
      }),
    ).toBeInTheDocument();

    await user.clear(stockInput);
    await user.type(stockInput, "100");
    expect(
      within(dialog).getByText((content, node) => {
        return (
          node?.textContent === "Current total 100.00%" &&
          content.includes("Current total")
        );
      }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Save targets" }),
    );

    expect(apiMutation).toHaveBeenCalledTimes(1);
    const targetsCall = vi.mocked(apiMutation).mock.calls[0];
    expect(targetsCall).toBeDefined();
    const request = targetsCall![1]!;
    const payload = JSON.parse(request.body as string);
    expect(payload).toMatchObject({
      assetKindTargets: [{ kind: "STOCK", targetPercent: 100 }],
    });
    expect(payload.assetKindTargets[0]).not.toHaveProperty("enabled");
  });

  it("filters brokerage activity by month and source with month groups matching the activity pattern", async () => {
    const user = userEvent.setup();

    render(
      <BrokeragePageClient
        workspace={buildWorkspace()}
        categories={categories}
      />,
    );

    await user.click(screen.getByText("Activity"));
    await user.click(screen.getByText("Filter"));

    expect(
      screen.getByRole("option", { name: "May 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "April 2026" }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Month"), "2026-05");
    await user.selectOptions(screen.getByLabelText("Source"), "TRANSACTION");

    expect(screen.getByText("2 active")).toBeInTheDocument();
    expect(
      screen.getByText("Dividend mirrored transaction"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sell")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "April 2026" }),
    ).not.toBeInTheDocument();
  });

  it("uses Europe/Rome month keys for activity filters at month boundaries", async () => {
    const user = userEvent.setup();
    const workspace = buildWorkspace();

    workspace.activity = [
      {
        id: "txn-boundary",
        source: "TRANSACTION" as const,
        kind: "INCOME",
        postedAt: "2026-04-30T22:30:00.000Z",
        title: "Boundary dividend",
        detail: "Dividends",
        amount: 8,
        currency: "EUR",
        notes: null,
        assetId: "asset-stock",
        assetName: "VWCE",
        quantity: null,
        unitPrice: null,
        feeAmount: null,
        transactionId: "transaction-boundary",
      },
    ];

    render(
      <BrokeragePageClient workspace={workspace} categories={categories} />,
    );

    await user.click(screen.getByText("Activity"));
    await user.click(screen.getByText("Filter"));
    await user.selectOptions(screen.getByLabelText("Month"), "2026-05");

    expect(screen.getByText("Boundary dividend")).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });

  it("hides brokerage activity times and uses date-only operation fields when disabled", async () => {
    const user = userEvent.setup();

    render(
      <BrokeragePageClient
        workspace={buildWorkspace()}
        categories={categories}
        showTransactionTimes={false}
      />,
    );

    await user.click(screen.getByText("Activity"));

    expect(screen.getByText(/VWCE.*19\/05\/26/)).toBeInTheDocument();
    expect(screen.queryByText(/10:00:00/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Buy" }));
    expect(screen.getByLabelText("Posted at")).toHaveAttribute("type", "date");
  });

  it("refreshes brokerage prices once after hydration when stored pricing is stale", async () => {
    const workspace = buildWorkspace();
    workspace.pricingStatus = {
      state: "STALE",
      refreshSuggested: true,
      hasStaleQuotes: true,
      hasStaleFx: false,
      hasMissingFx: false,
    };

    render(
      <BrokeragePageClient workspace={workspace} categories={categories} />,
    );

    await waitFor(() => {
      expect(requestDashboardRefresh).toHaveBeenCalledTimes(1);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("hides stale brokerage status when live quotes cover stale positions", async () => {
    const workspace = buildWorkspace();
    workspace.pricingStatus = {
      state: "STALE",
      refreshSuggested: true,
      hasStaleQuotes: true,
      hasStaleFx: false,
      hasMissingFx: false,
    };
    workspace.positions = workspace.positions.map((position) => ({
      ...position,
      valuationSource: "LAST_QUOTE" as const,
      isStale: true,
    }));
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.includes("/performance")) {
        return Promise.resolve(buildPerformanceResponse());
      }
      if (path.includes("/assets/live-valuations")) {
        return Promise.resolve({
          ...buildLiveValuationsResponse(),
          quotes: [
            {
              assetId: "asset-stock",
              price: 61,
              currency: "EUR",
              value: 732,
              valueInReporting: 732,
              isStale: false,
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected api call: ${path}`));
    });

    render(
      <BrokeragePageClient workspace={workspace} categories={categories} />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Latest stored prices/)).toBeNull();
    });
  });

  it("does not immediately repeat brokerage auto-refresh for the returned snapshot", async () => {
    const workspace = buildWorkspace();
    workspace.pricingStatus = {
      state: "STALE",
      refreshSuggested: true,
      hasStaleQuotes: true,
      hasStaleFx: false,
      hasMissingFx: false,
    };
    vi.mocked(requestDashboardRefresh).mockResolvedValue({
      ok: true,
      refreshedAt: "2026-05-19T10:01:00.000Z",
      warning: null,
    });

    const { rerender } = render(
      <BrokeragePageClient workspace={workspace} categories={categories} />,
    );

    await waitFor(() => {
      expect(requestDashboardRefresh).toHaveBeenCalledTimes(1);
    });

    rerender(
      <BrokeragePageClient
        workspace={{
          ...workspace,
          lastRefreshAt: "2026-05-19T10:01:00.000Z",
        }}
        categories={categories}
      />,
    );

    expect(requestDashboardRefresh).toHaveBeenCalledTimes(1);
  });
});
