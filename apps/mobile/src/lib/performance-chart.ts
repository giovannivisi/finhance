import type {
  BrokeragePerformancePointResponse,
  BrokeragePerformanceRange,
} from "@finhance/shared";

/**
 * Pure helpers for the brokerage portfolio performance chart: time-axis
 * label formatting per range, and percent-deviation gridline computation.
 * Kept free of react-native-svg so they can be unit tested directly.
 */

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Formats a single point's timestamp for the bottom time axis, with the
 * style depending on the selected range:
 *  - 1D: clock hours, e.g. "9:00"
 *  - 1W / 1M: day + short month, e.g. "8 Jun"
 *  - 1Y: short month name, e.g. "Jun"
 *  - MAX: calendar year, e.g. "2024"
 */
export function formatAxisTimeLabel(
  epochMs: number,
  range: BrokeragePerformanceRange,
): string {
  const date = new Date(epochMs);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  switch (range) {
    case "1D": {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      return minutes === 0
        ? `${hours}:00`
        : `${hours}:${String(minutes).padStart(2, "0")}`;
    }
    case "1W":
    case "1M":
      return `${date.getDate()} ${MONTH_ABBR[date.getMonth()]}`;
    case "1Y":
      return MONTH_ABBR[date.getMonth()] ?? "";
    case "MAX":
      return `${date.getFullYear()}`;
    default:
      return "";
  }
}

/**
 * Picks evenly spaced indices into `points` for the bottom axis labels,
 * always including the first and last point. Returns at most `tickCount`
 * indices (default 4), fewer when there are not enough points.
 */
export function selectAxisTickIndices(
  pointCount: number,
  tickCount = 4,
): number[] {
  if (pointCount <= 0) {
    return [];
  }

  if (pointCount <= tickCount) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }

  const step = (pointCount - 1) / (tickCount - 1);
  const indices = new Set<number>();

  for (let i = 0; i < tickCount; i += 1) {
    indices.add(Math.round(i * step));
  }

  return [...indices].sort((a, b) => a - b);
}

export interface AxisTimeLabel {
  index: number;
  label: string;
}

/** Convenience wrapper combining tick selection and label formatting. */
export function buildAxisTimeLabels(
  points: readonly BrokeragePerformancePointResponse[],
  range: BrokeragePerformanceRange,
  tickCount = 4,
): AxisTimeLabel[] {
  return selectAxisTickIndices(points.length, tickCount).map((index) => ({
    index,
    label: formatAxisTimeLabel(points[index]!.t, range),
  }));
}

export interface PercentGridline {
  /** Portfolio value at this gridline. */
  value: number;
  /** Percent deviation from the baseline value, e.g. 1.3 or -0.25. */
  percent: number;
  /** Formatted label, e.g. "1.3 %" or "-0.25 %". */
  label: string;
}

function formatPercentLabel(percent: number): string {
  const rounded = Math.round(Math.abs(percent) * 100) / 100;
  // Trim trailing zeros but keep up to 2 decimal places.
  const text = rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const sign = percent < 0 ? "-" : "";
  return `${sign}${text || "0"} %`;
}

/**
 * Computes 3-4 unobtrusive right-edge gridlines showing the percent
 * deviation from the baseline at evenly spaced value levels spanning the
 * series' min/max. Returns an empty array when there is no baseline or no
 * points (nothing meaningful to show).
 */
export function computePercentGridlines(
  points: readonly BrokeragePerformancePointResponse[],
  baselineValue: number | null,
  lineCount = 4,
): PercentGridline[] {
  if (!baselineValue || points.length === 0) {
    return [];
  }

  const values = points.map((point) => point.value);
  let min = Math.min(...values, baselineValue);
  let max = Math.max(...values, baselineValue);

  if (min === max) {
    // Flat series: spread a small band around the single value so the
    // gridlines remain distinct.
    const pad = Math.abs(min) * 0.005 || 1;
    min -= pad;
    max += pad;
  }

  const gridlines: PercentGridline[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    const fraction = lineCount === 1 ? 1 : 1 - i / (lineCount - 1);
    const value = min + (max - min) * fraction;
    const percent = ((value - baselineValue) / baselineValue) * 100;

    gridlines.push({ value, percent, label: formatPercentLabel(percent) });
  }

  return gridlines;
}

/**
 * Whether the performance line should render in the "positive" (green)
 * tone: the latest value is at or above the baseline.
 */
export function isPerformancePositive(
  latestValue: number | null,
  baselineValue: number | null,
): boolean {
  if (latestValue === null || baselineValue === null) {
    return true;
  }

  return latestValue >= baselineValue;
}
