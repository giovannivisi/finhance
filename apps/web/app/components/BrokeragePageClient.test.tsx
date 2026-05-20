import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrokeragePageClient from "@components/BrokeragePageClient";
import { apiMutation } from "@lib/api";

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

function buildWorkspace() {
  return {
    baseCurrency: "EUR",
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

describe("BrokeragePageClient", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    prefetchMock.mockReset();
    vi.mocked(apiMutation).mockReset();
  });

  it("renders the brokerage workspace and routes account switching through the deep link", async () => {
    const user = userEvent.setup();

    render(<BrokeragePageClient workspace={buildWorkspace()} categories={categories} />);

    expect(
      screen.getByRole("heading", { name: "Brokerage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cash reconciliation")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Broker account"), "broker-2");

    expect(pushMock).toHaveBeenCalledWith("/brokerage/broker-2");
  });

  it("records a dividend through the dedicated brokerage endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(apiMutation).mockResolvedValue(undefined);

    render(<BrokeragePageClient workspace={buildWorkspace()} categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Operations" }));
    await user.click(screen.getByRole("menuitem", { name: "Dividend" }));

    const dialog = await screen.findByRole("dialog", { name: "Record dividend" });
    await user.selectOptions(within(dialog).getByLabelText("Holding"), "asset-stock");
    await user.type(within(dialog).getByLabelText("Amount"), "12.5");
    await user.selectOptions(
      within(dialog).getByLabelText("Category"),
      "income-dividend",
    );
    await user.click(within(dialog).getByRole("button", { name: "Record dividend" }));

    expect(apiMutation).toHaveBeenCalledTimes(1);
    const [path, request] = vi.mocked(apiMutation).mock.calls[0];
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

  it("blocks invalid target totals before calling the API", async () => {
    const user = userEvent.setup();

    render(<BrokeragePageClient workspace={buildWorkspace()} categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Edit targets" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Edit allocation targets",
    });
    const stockInput = within(dialog).getByDisplayValue("60");
    await user.clear(stockInput);
    await user.type(stockInput, "50");
    await user.click(within(dialog).getByRole("button", { name: "Save targets" }));

    expect(await within(dialog).findByText("Asset-class targets must sum to 100%.")).toBeInTheDocument();
    expect(apiMutation).not.toHaveBeenCalled();
  });

  it("supports turning a target row off and excludes it from the saved payload", async () => {
    const user = userEvent.setup();
    vi.mocked(apiMutation).mockResolvedValue(undefined);

    render(<BrokeragePageClient workspace={buildWorkspace()} categories={categories} />);

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

    await user.click(within(cashToggleGroup).getByRole("button", { name: "Off" }));
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

    await user.click(within(dialog).getByRole("button", { name: "Save targets" }));

    expect(apiMutation).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(apiMutation).mock.calls[0];
    const payload = JSON.parse(request.body as string);
    expect(payload).toMatchObject({
      assetKindTargets: [{ kind: "STOCK", targetPercent: 100 }],
    });
    expect(payload.assetKindTargets[0]).not.toHaveProperty("enabled");
  });
});
