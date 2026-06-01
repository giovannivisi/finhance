import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardAssetResponse } from "@finhance/shared";
import DashboardClient from "@components/DashboardClient";
import { apiMutation } from "@lib/api";
import { requestDashboardRefresh } from "@lib/dashboard-refresh";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    prefetch: vi.fn(),
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
    toggleHideMoney: vi.fn(),
    hasAttemptedDashboardRefresh: () => true,
    markDashboardRefreshAttempted: vi.fn(),
  }),
}));

vi.mock("@/components/CreateAssetModal", () => ({
  default: () => null,
}));

vi.mock("@components/EditAssetModal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Edit asset" /> : null,
}));

vi.mock("@components/CooldownNotice", () => ({
  default: () => null,
}));

vi.mock("@components/HeaderAddButton", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/SectionHeader", () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

vi.mock("@components/DisclosureIcon", () => ({
  default: () => null,
}));

vi.mock("@components/AllocationChart", () => ({
  default: () => null,
}));

vi.mock("@lib/dashboard-refresh", () => ({
  getDashboardRefreshNotice: vi.fn(),
  requestDashboardRefresh: vi.fn(),
}));

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
  fetchApiMutation: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  TouchSensor: class {},
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/modifiers", () => ({
  restrictToParentElement: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  arrayMove: <T,>(items: T[]) => items,
  defaultAnimateLayoutChanges: vi.fn(() => true),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Translate: {
      toString: () => undefined,
    },
  },
}));

function buildAsset(
  overrides: Partial<DashboardAssetResponse>,
): DashboardAssetResponse {
  return {
    id: overrides.id ?? "asset-1",
    name: overrides.name ?? "Asset",
    type: overrides.type ?? "ASSET",
    kind: overrides.kind ?? "STOCK",
    currency: overrides.currency ?? "EUR",
    balance: overrides.balance ?? 0,
    currentValue: overrides.currentValue ?? 100,
    referenceValue: overrides.referenceValue ?? 95,
    valuationSource: overrides.valuationSource ?? "LIVE",
    valuationAsOf: overrides.valuationAsOf ?? "2026-05-20T10:00:00.000Z",
    isStale: overrides.isStale ?? false,
    unitPrice: overrides.unitPrice ?? 50,
    quantity: overrides.quantity ?? 2,
    ticker: overrides.ticker ?? "VWCE",
    notes: overrides.notes ?? null,
    accountId: overrides.accountId ?? "broker-1",
    accountName: overrides.accountName ?? "Broker account",
    accountType: overrides.accountType ?? "BROKER",
    liabilityKind: overrides.liabilityKind ?? null,
    exchange: overrides.exchange ?? null,
    order: overrides.order ?? 0,
    lastPrice: overrides.lastPrice ?? null,
    lastPriceAt: overrides.lastPriceAt ?? null,
    lastFxRate: overrides.lastFxRate ?? null,
    lastFxRateAt: overrides.lastFxRateAt ?? null,
  } as unknown as DashboardAssetResponse;
}

describe("DashboardClient", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.mocked(apiMutation).mockReset();
    vi.mocked(requestDashboardRefresh).mockReset();
    vi.mocked(requestDashboardRefresh).mockResolvedValue({ ok: true });
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-hide-money", "false");
  });

  function renderDashboard(options?: {
    pricingStatus?: {
      state: "FRESH" | "STALE" | "PARTIAL";
      refreshSuggested: boolean;
      hasStaleQuotes: boolean;
      hasStaleFx: boolean;
      hasMissingFx: boolean;
    };
    assetOverrides?: Partial<DashboardAssetResponse>;
  }) {
    const assetWithBrokerage = buildAsset({
      id: "asset-brokerage",
      name: "VWCE",
      accountId: "broker-1",
      currentValue: 120,
      referenceValue: 110,
      ...options?.assetOverrides,
    });
    const liability = buildAsset({
      id: "liability-1",
      name: "Card balance",
      type: "LIABILITY",
      kind: null,
      liabilityKind: "DEBT",
      accountId: "manual-1",
      ticker: null,
      quantity: null,
      unitPrice: 80,
      currentValue: 80,
      referenceValue: 80,
      valuationSource: "DIRECT_BALANCE",
    });

    return render(
      <DashboardClient
        grouped={{
          ETFs: [assetWithBrokerage],
          Debts: [liability],
        }}
        kindTotalsArray={[
          { kind: "ETFs", total: 120 },
          { kind: "Debts", total: -80 },
        ]}
        baseCurrency="EUR"
        pricingStatus={
          options?.pricingStatus ?? {
            state: "FRESH",
            refreshSuggested: false,
            hasStaleQuotes: false,
            hasStaleFx: false,
            hasMissingFx: false,
          }
        }
        lastRefreshAt="2026-05-20T10:00:00.000Z"
        summary={{ assets: 120, liabilities: 80, netWorth: 40 }}
        assetKindOrder={["ETFs", "Debts"]}
        brokerageAccountIds={["broker-1"]}
      />,
    );
  }

  it("shows Brokerage only for assets linked to a brokerage account", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const actionButtons = screen.getAllByRole("button", {
      name: "Asset actions",
    });

    await user.click(actionButtons[0] as HTMLButtonElement);
    expect(
      screen.getByRole("menuitem", { name: "Brokerage" }),
    ).toBeInTheDocument();

    await user.click(actionButtons[1] as HTMLButtonElement);
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Brokerage" })).toBeNull(),
    );
  });

  it("closes the menu and opens the edit flow", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      screen.getAllByRole("button", { name: "Asset actions" })[0]!,
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Asset actions" })).toBeNull(),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit asset" }),
    ).toBeInTheDocument();
  });

  it("opens the delete confirmation from the overflow menu", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      screen.getAllByRole("button", { name: "Asset actions" })[0]!,
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete asset" }));

    expect(
      await screen.findByRole("dialog", { name: "Delete asset" }),
    ).toBeInTheDocument();
  });

  it("does not auto-refresh stale pricing on hydration", () => {
    renderDashboard({
      pricingStatus: {
        state: "STALE",
        refreshSuggested: true,
        hasStaleQuotes: true,
        hasStaleFx: false,
        hasMissingFx: false,
      },
    });

    expect(requestDashboardRefresh).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Latest stored values shown\. Refresh when you want live quotes/,
      ),
    ).toBeInTheDocument();
  });

  it("shows latest labels for stale stored valuations", () => {
    renderDashboard({
      pricingStatus: {
        state: "STALE",
        refreshSuggested: true,
        hasStaleQuotes: true,
        hasStaleFx: true,
        hasMissingFx: false,
      },
      assetOverrides: {
        valuationSource: "LAST_QUOTE",
        isStale: true,
        currentValue: 120,
        referenceValue: 120,
      },
    });

    expect(screen.getByText("LATEST")).toBeInTheDocument();
    expect(screen.getByText("Latest quote")).toBeInTheDocument();
  });

  it("does not show latest badges for average-cost fallback values", () => {
    renderDashboard({
      assetOverrides: {
        valuationSource: "AVG_COST",
        isStale: true,
        currentValue: 120,
        referenceValue: 120,
      },
    });

    expect(screen.queryByText("LATEST")).not.toBeInTheDocument();
    expect(screen.getByText("Reference avg cost")).toBeInTheDocument();
  });
});
