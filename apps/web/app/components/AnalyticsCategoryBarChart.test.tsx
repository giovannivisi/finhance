import React, { createContext, useContext } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalyticsCategoryBarChart from "@components/AnalyticsCategoryBarChart";

const push = vi.fn();
const ChartDataContext = createContext<Array<{ href?: string; selectionKey?: string }>>(
  [],
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
}));

vi.mock("@components/ThemeProvider", () => ({
  useAppPreferences: () => ({
    hideMoney: false,
    isHydrated: true,
  }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({
    data,
    onClick,
    children,
  }: {
    data: Array<{ href?: string; selectionKey?: string }>;
    onClick?: (state: { activeTooltipIndex?: number }) => void;
    children: React.ReactNode;
  }) => (
    <ChartDataContext.Provider value={data}>
      <button
        type="button"
        onClick={() => onClick?.({ activeTooltipIndex: 0 })}
      >
        Chart row 1
      </button>
      {children}
    </ChartDataContext.Provider>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Cell: () => null,
  Bar: ({
    onClick,
  }: {
    onClick?: (entry?: { href?: string; selectionKey?: string }) => void;
  }) => {
    const data = useContext(ChartDataContext);

    return (
      <div>
        {data.map((item, index) => (
          <button
            key={`${item.selectionKey ?? item.href ?? index}`}
            type="button"
            onClick={() => onClick?.(item)}
          >
            Bar {index + 1}
          </button>
        ))}
      </div>
    );
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsCategoryBarChart", () => {
  it("navigates when href is provided and no local selection handler is used", () => {
    render(
      <AnalyticsCategoryBarChart
        currency="EUR"
        mode="breakdown"
        data={[
          {
            name: "Rent",
            total: 750,
            href: "/transactions?primaryCategoryId=rent",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Bar 1" }));

    expect(push).toHaveBeenCalledWith(
      "/transactions?primaryCategoryId=rent",
    );
  });

  it("uses local bar selection instead of navigation when a selection key is provided", () => {
    const onBarSelect = vi.fn();

    render(
      <AnalyticsCategoryBarChart
        currency="EUR"
        mode="breakdown"
        onBarSelect={onBarSelect}
        selectedKey="rent"
        data={[
          {
            name: "Rent",
            total: 750,
            selectionKey: "rent",
            href: "/transactions?primaryCategoryId=rent",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Bar 1" }));

    expect(onBarSelect).toHaveBeenCalledWith("rent");
    expect(push).not.toHaveBeenCalled();
  });

  it("uses the active chart row when clicking outside the painted bar", () => {
    const onBarSelect = vi.fn();

    render(
      <AnalyticsCategoryBarChart
        currency="EUR"
        mode="breakdown"
        onBarSelect={onBarSelect}
        data={[
          {
            name: "Rent",
            total: 750,
            selectionKey: "rent",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chart row 1" }));

    expect(onBarSelect).toHaveBeenCalledWith("rent");
    expect(push).not.toHaveBeenCalled();
  });
});
