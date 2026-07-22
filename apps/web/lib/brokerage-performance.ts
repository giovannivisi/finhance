import type {
  BrokeragePerformanceRange,
  BrokeragePerformanceResponse,
} from "@finhance/shared";
import { api } from "./api.ts";

/** Range chips shown above the performance chart, in display order. */
export const PERFORMANCE_RANGE_OPTIONS: {
  value: BrokeragePerformanceRange;
  label: string;
}[] = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "1Y", label: "1Y" },
  { value: "MAX", label: "Max" },
];

export const DEFAULT_PERFORMANCE_RANGE: BrokeragePerformanceRange = "1D";

/**
 * Fetches the performance series for a brokerage account and range. Errors
 * from `api()` (network failures, non-2xx responses) propagate to the
 * caller.
 */
export function fetchBrokeragePerformance(
  accountId: string,
  range: BrokeragePerformanceRange,
): Promise<BrokeragePerformanceResponse> {
  return api<BrokeragePerformanceResponse>(
    `/brokerage/${encodeURIComponent(accountId)}/performance?range=${range}`,
  );
}

const PERFORMANCE_AXIS_TIME_ZONE = "Europe/Rome";

const HOUR_LABEL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: PERFORMANCE_AXIS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DAY_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: PERFORMANCE_AXIS_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: PERFORMANCE_AXIS_TIME_ZONE,
  month: "short",
});

const YEAR_LABEL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: PERFORMANCE_AXIS_TIME_ZONE,
  year: "numeric",
});

/**
 * Formats the bottom-axis time label for a point's epoch-millisecond
 * timestamp, following the convention for each range: clock hours for 1D,
 * day + month for 1W/1M, month abbreviations for 1Y, and years for MAX.
 */
export function formatPerformanceAxisLabel(
  t: number,
  range: BrokeragePerformanceRange,
): string {
  const date = new Date(t);

  switch (range) {
    case "1D":
      return HOUR_LABEL_FORMATTER.format(date);
    case "1W":
    case "1M":
      return DAY_MONTH_LABEL_FORMATTER.format(date);
    case "1Y":
      return MONTH_LABEL_FORMATTER.format(date);
    case "MAX":
      return YEAR_LABEL_FORMATTER.format(date);
    default:
      return DAY_MONTH_LABEL_FORMATTER.format(date);
  }
}

/**
 * Formats a percentage deviation from the chart baseline for the muted
 * right-edge gridline labels, e.g. `+2.3%` or `-1.0%`. Returns `0%` for
 * values that round to zero so the baseline gridline reads cleanly.
 */
export function formatPerformancePercentLabel(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;

  if (rounded === 0) {
    return "0%";
  }

  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

/**
 * Formats the headline change badge text, e.g. `▲ 1.2%` or `▼ 0.8%`.
 * Returns `null` when the change percentage is unknown.
 */
export function formatPerformanceChangeBadge(
  changePercent: number | null,
): { direction: "up" | "down" | "flat"; label: string } | null {
  if (changePercent == null) {
    return null;
  }

  const direction =
    changePercent > 0 ? "up" : changePercent < 0 ? "down" : "flat";
  const magnitude = Math.abs(changePercent).toFixed(2);

  return { direction, label: `${magnitude}%` };
}

export interface PerformanceChartGeometryPoint {
  x: number;
  y: number;
  t: number;
  value: number;
}

export interface PerformanceChartGeometry {
  /** SVG path `d` attribute for the value line. */
  linePath: string;
  /** Plotted point coordinates, in viewBox units. */
  points: PerformanceChartGeometryPoint[];
  /** Y coordinate of the dotted baseline, in viewBox units. */
  baselineY: number;
  /** Right-edge gridline labels, evenly spaced top to bottom. */
  gridlineLabels: { y: number; label: string }[];
}

const GRIDLINE_COUNT = 4;

/**
 * Computes the SVG geometry for the performance line chart: the line path,
 * plotted point coordinates, the baseline's y position, and percent-
 * deviation labels for evenly spaced gridlines.
 *
 * Returns `null` when there are fewer than two points, since a line cannot
 * be drawn.
 */
export function buildPerformanceChartGeometry(
  points: { t: number; value: number }[],
  baselineValue: number | null,
  width: number,
  height: number,
): PerformanceChartGeometry | null {
  if (points.length < 2) {
    return null;
  }

  const values = points.map((point) => point.value);
  const baseline = baselineValue ?? values[0];
  const allValues = [...values, baseline];
  const max = Math.max(...allValues);
  const min = Math.min(...allValues);
  const range = max - min || 1;

  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const tRange = maxT - minT || 1;

  function valueToY(value: number): number {
    return height - ((value - min) / range) * height;
  }

  const coords = points.map((point) => ({
    x: ((point.t - minT) / tRange) * width,
    y: valueToY(point.value),
    t: point.t,
    value: point.value,
  }));

  const linePath = coords
    .map(
      (coord, index) =>
        `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`,
    )
    .join(" ");

  const baselineY = valueToY(baseline);

  const gridlineLabels: { y: number; label: string }[] = [];
  for (let i = 0; i < GRIDLINE_COUNT; i += 1) {
    const y = (height / (GRIDLINE_COUNT - 1)) * i;
    const value = min + range * (1 - y / height);
    const percentFromBaseline =
      baseline === 0 ? 0 : ((value - baseline) / baseline) * 100;
    gridlineLabels.push({
      y,
      label: formatPerformancePercentLabel(percentFromBaseline),
    });
  }

  return { linePath, points: coords, baselineY, gridlineLabels };
}
