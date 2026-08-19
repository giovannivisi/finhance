import { describe, expect, it } from "vitest";
import type { BrokeragePerformancePointResponse } from "@finhance/shared";

import {
  buildAxisTimeLabels,
  computePercentGridlines,
  formatAxisTimeLabel,
  getPerformancePlotMetrics,
  isPerformancePositive,
  selectAxisTickIndices,
  withLatestPerformanceValue,
} from "./performance-chart";

function point(t: number, value: number): BrokeragePerformancePointResponse {
  return { t, value };
}

describe("formatAxisTimeLabel", () => {
  it("formats 1D points as clock hours", () => {
    const t = new Date(2026, 5, 12, 9, 0).getTime();
    expect(formatAxisTimeLabel(t, "1D")).toBe("9:00");
  });

  it("includes minutes when not on the hour for 1D", () => {
    const t = new Date(2026, 5, 12, 9, 30).getTime();
    expect(formatAxisTimeLabel(t, "1D")).toBe("9:30");
  });

  it("formats 1W/1M points as day + short month", () => {
    const t = new Date(2026, 5, 8, 12, 0).getTime();
    expect(formatAxisTimeLabel(t, "1W")).toBe("8 Jun");
    expect(formatAxisTimeLabel(t, "1M")).toBe("8 Jun");
  });

  it("formats 1Y points as short month names", () => {
    const t = new Date(2026, 0, 15).getTime();
    expect(formatAxisTimeLabel(t, "1Y")).toBe("Jan");
  });

  it("formats MAX points as calendar years", () => {
    const t = new Date(2024, 5, 1).getTime();
    expect(formatAxisTimeLabel(t, "MAX")).toBe("2024");
  });

  it("returns an empty string for invalid timestamps", () => {
    expect(formatAxisTimeLabel(Number.NaN, "1D")).toBe("");
  });
});

describe("selectAxisTickIndices", () => {
  it("returns all indices when there are fewer points than ticks", () => {
    expect(selectAxisTickIndices(3, 4)).toEqual([0, 1, 2]);
  });

  it("includes the first and last index for larger series", () => {
    const indices = selectAxisTickIndices(100, 4);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(99);
    expect(indices.length).toBeLessThanOrEqual(4);
  });

  it("returns an empty array for no points", () => {
    expect(selectAxisTickIndices(0)).toEqual([]);
  });
});

describe("buildAxisTimeLabels", () => {
  it("pairs selected indices with formatted labels", () => {
    const points = [
      point(new Date(2026, 5, 1).getTime(), 100),
      point(new Date(2026, 5, 2).getTime(), 101),
      point(new Date(2026, 5, 3).getTime(), 102),
    ];
    const labels = buildAxisTimeLabels(points, "1W", 4);
    expect(labels).toEqual([
      { index: 0, label: "1 Jun" },
      { index: 1, label: "2 Jun" },
      { index: 2, label: "3 Jun" },
    ]);
  });
});

describe("computePercentGridlines", () => {
  it("returns evenly spaced gridlines with percent labels relative to baseline", () => {
    const points = [point(1, 100), point(2, 101.3), point(3, 99.75)];
    const gridlines = computePercentGridlines(points, 100, 4);

    expect(gridlines).toHaveLength(4);
    // Highest value first (1.3% above baseline of 100).
    expect(gridlines[0]!.percent).toBeCloseTo(1.3, 5);
    expect(gridlines[0]!.label).toBe("1.3 %");
    // Lowest value last (-0.25% below baseline of 100).
    expect(gridlines[3]!.percent).toBeCloseTo(-0.25, 5);
    expect(gridlines[3]!.label).toBe("-0.25 %");
  });

  it("keeps each percentage step the same size across the plot", () => {
    const gridlines = computePercentGridlines(
      [point(1, 100.05), point(2, 99.95)],
      100,
      4,
    );
    const steps = gridlines
      .slice(1)
      .map((gridline, index) => gridlines[index]!.percent - gridline.percent);

    expect(steps[0]).toBeCloseTo(steps[1]!, 10);
    expect(steps[1]).toBeCloseTo(steps[2]!, 10);
  });

  it("returns an empty array when there is no baseline", () => {
    expect(computePercentGridlines([point(1, 100)], null)).toEqual([]);
  });

  it("returns an empty array for an empty series", () => {
    expect(computePercentGridlines([], 100)).toEqual([]);
  });

  it("spreads a small band around a flat series", () => {
    const points = [point(1, 100), point(2, 100)];
    const gridlines = computePercentGridlines(points, 100, 4);
    expect(gridlines).toHaveLength(4);
    expect(gridlines[0]!.percent).toBeGreaterThan(0);
    expect(gridlines[3]!.percent).toBeLessThan(0);
  });
});

describe("withLatestPerformanceValue", () => {
  it("updates a stale final point without changing the historical curve", () => {
    const points = [point(1, 100), point(2, 99.95), point(3, 99.8)];

    expect(withLatestPerformanceValue(points, 100)).toEqual([
      point(1, 100),
      point(2, 99.95),
      point(3, 100),
    ]);
  });

  it("leaves points unchanged when the latest value is unavailable", () => {
    const points = [point(1, 100), point(2, 99.95)];

    expect(withLatestPerformanceValue(points, null)).toEqual(points);
    expect(withLatestPerformanceValue([], 100)).toEqual([]);
  });

  it("leaves the endpoint unchanged when it already matches the latest value", () => {
    const points = [point(1, 100), point(2, 99.95)];

    expect(withLatestPerformanceValue(points, 99.95)).toEqual(points);
  });
});

describe("getPerformancePlotMetrics", () => {
  it("insets the plot by half a label so edge labels stay aligned", () => {
    expect(getPerformancePlotMetrics(218, 16)).toEqual({
      topInset: 8,
      plotHeight: 202,
    });
  });

  it("keeps the plot non-negative for a very small chart", () => {
    expect(getPerformancePlotMetrics(8, 16)).toEqual({
      topInset: 4,
      plotHeight: 0,
    });
  });
});

describe("isPerformancePositive", () => {
  it("is positive when the latest value is at or above the baseline", () => {
    expect(isPerformancePositive(105, 100)).toBe(true);
    expect(isPerformancePositive(100, 100)).toBe(true);
  });

  it("is negative when the latest value is below the baseline", () => {
    expect(isPerformancePositive(95, 100)).toBe(false);
  });

  it("defaults to positive when either value is missing", () => {
    expect(isPerformancePositive(null, 100)).toBe(true);
    expect(isPerformancePositive(100, null)).toBe(true);
  });
});
