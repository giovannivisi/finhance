import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatePricingStatus } from "@finhance/shared";
import BrokeragePerformanceChart from "@components/BrokeragePerformanceChart";
import { api } from "@lib/api";

vi.mock("@components/ThemeProvider", () => ({
  useAppPreferences: () => ({
    hideMoney: false,
    isHydrated: true,
  }),
}));

vi.mock("@lib/api", () => ({
  api: vi.fn(),
}));

const PRICING_STATUS_FRESH: AggregatePricingStatus = {
  state: "FRESH",
  refreshSuggested: false,
  hasStaleQuotes: false,
  hasStaleFx: false,
  hasMissingFx: false,
};

function buildPerformanceResponse(
  overrides: Partial<{
    points: { t: number; value: number }[];
    baselineValue: number | null;
    latestValue: number | null;
    changePercent: number | null;
    pricingStatus: typeof PRICING_STATUS_FRESH;
  }> = {},
) {
  return {
    range: "1D" as const,
    reportingCurrency: "EUR",
    pricingStatus: overrides.pricingStatus ?? PRICING_STATUS_FRESH,
    points: overrides.points ?? [
      { t: Date.UTC(2026, 5, 12, 7, 0), value: 1480 },
      { t: Date.UTC(2026, 5, 12, 15, 0), value: 1500 },
    ],
    baselineValue: overrides.baselineValue ?? 1480,
    latestValue: overrides.latestValue ?? 1500,
    changeAbsolute: 20,
    changePercent: overrides.changePercent ?? ((1500 - 1480) / 1480) * 100,
    asOf: "2026-06-12T15:00:00.000Z",
  };
}

describe("BrokeragePerformanceChart", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the latest value, change badge and chart line for the default range", async () => {
    vi.mocked(api).mockResolvedValue(buildPerformanceResponse());

    render(
      <BrokeragePerformanceChart
        accountId="broker-1"
        reportingCurrency="EUR"
        fallbackInvestedValue={1450}
        liveInvestedValue={null}
        isLivePolling={false}
      />,
    );

    await waitFor(() => {
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/brokerage/broker-1/performance?range=1D",
      );
    });

    // CLDR only applies Italian thousands grouping from five digits, so
    // accept both the grouped and ungrouped renderings of 1500.
    expect(await screen.findByText(/1\.?500,00/)).toBeInTheDocument();

    const badge = await screen.findByText(/1\.35%/);
    expect(badge.closest(".brokerage-performance-badge")).toHaveClass("is-up");

    const path = document.querySelector(".brokerage-performance-svg path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toMatch(/^M0\.00,/);
  });

  it("switches range and refetches the series when a range chip is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockImplementation((path: unknown) => {
      const url = String(path);
      if (url.includes("range=1W")) {
        return Promise.resolve(
          buildPerformanceResponse({
            points: [
              { t: Date.UTC(2026, 5, 5, 0, 0), value: 1400 },
              { t: Date.UTC(2026, 5, 12, 0, 0), value: 1500 },
            ],
            baselineValue: 1400,
            latestValue: 1500,
            changePercent: ((1500 - 1400) / 1400) * 100,
          }),
        );
      }
      return Promise.resolve(buildPerformanceResponse());
    });

    render(
      <BrokeragePerformanceChart
        accountId="broker-1"
        reportingCurrency="EUR"
        fallbackInvestedValue={1450}
        liveInvestedValue={null}
        isLivePolling={false}
      />,
    );

    await waitFor(() => {
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/brokerage/broker-1/performance?range=1D",
      );
    });

    await user.click(screen.getByRole("button", { name: "1W" }));

    await waitFor(() => {
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        "/brokerage/broker-1/performance?range=1W",
      );
    });

    const badge = await screen.findByText(/7\.14%/);
    expect(badge.closest(".brokerage-performance-badge")).toHaveClass("is-up");
  });

  it("shows the live indicator and live total value while polling", async () => {
    vi.mocked(api).mockResolvedValue(buildPerformanceResponse());

    render(
      <BrokeragePerformanceChart
        accountId="broker-1"
        reportingCurrency="EUR"
        fallbackInvestedValue={1450}
        liveInvestedValue={1510}
        isLivePolling
      />,
    );

    await waitFor(() => {
      expect(vi.mocked(api)).toHaveBeenCalled();
    });

    expect(await screen.findByText(/1\.?510,00/)).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Live prices updating" }),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton before data arrives and an empty state for too few points", async () => {
    let resolvePerformance: (value: unknown) => void = () => {};
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePerformance = resolve;
        }),
    );

    render(
      <BrokeragePerformanceChart
        accountId="broker-1"
        reportingCurrency="EUR"
        fallbackInvestedValue={1450}
        liveInvestedValue={null}
        isLivePolling={false}
      />,
    );

    expect(
      document.querySelector(".brokerage-performance-skeleton"),
    ).not.toBeNull();

    resolvePerformance(
      buildPerformanceResponse({
        points: [{ t: Date.UTC(2026, 5, 12, 15, 0), value: 1500 }],
        baselineValue: 1500,
        latestValue: 1500,
        changePercent: 0,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Not enough data yet to chart this range."),
      ).toBeInTheDocument();
    });
  });

  it("shows a pricing note when the performance data is partial or stale", async () => {
    vi.mocked(api).mockResolvedValue(
      buildPerformanceResponse({
        pricingStatus: {
          ...PRICING_STATUS_FRESH,
          state: "PARTIAL",
        },
      }),
    );

    render(
      <BrokeragePerformanceChart
        accountId="broker-1"
        reportingCurrency="EUR"
        fallbackInvestedValue={1450}
        liveInvestedValue={null}
        isLivePolling={false}
      />,
    );

    expect(
      await screen.findByText(
        "Some positions are missing live prices; the chart reflects the latest available data.",
      ),
    ).toBeInTheDocument();
  });

  it("explains when historical data is unavailable from the provider", async () => {
    vi.mocked(api).mockResolvedValue(
      buildPerformanceResponse({
        points: [],
        baselineValue: null,
        latestValue: null,
        changePercent: null,
        pricingStatus: {
          ...PRICING_STATUS_FRESH,
          state: "PARTIAL",
        },
      }),
    );

    render(
      <BrokeragePerformanceChart
        accountId="broker-1"
        reportingCurrency="EUR"
        fallbackInvestedValue={1450}
        liveInvestedValue={null}
        isLivePolling={false}
      />,
    );

    expect(
      await screen.findByText(
        "Historical performance is temporarily unavailable.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The market-data provider did not return historical prices. Holdings and stored values are unaffected.",
      ),
    ).toBeInTheDocument();
  });
});
