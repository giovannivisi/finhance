"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type {
  BrokeragePerformanceRange,
  BrokeragePerformanceResponse,
} from "@finhance/shared";
import MoneyValue from "@components/MoneyValue";
import {
  buildPerformanceChartGeometry,
  DEFAULT_PERFORMANCE_RANGE,
  fetchBrokeragePerformance,
  formatPerformanceAxisLabel,
  formatPerformanceChangeBadge,
  PERFORMANCE_RANGE_OPTIONS,
} from "@lib/brokerage-performance";
import { computeLiveChangePercent } from "@lib/live-valuations";

const CHART_VIEW_WIDTH = 800;
const CHART_VIEW_HEIGHT = 260;
const MAX_BOTTOM_LABELS = 6;

/**
 * Picks an evenly spaced subset of points (including the first and last) to
 * render as bottom-axis time labels, so labels don't overlap on long series.
 */
function pickAxisLabelPoints<T>(points: T[], maxLabels: number): T[] {
  if (points.length <= maxLabels) {
    return points;
  }

  const step = (points.length - 1) / (maxLabels - 1);
  const picked: T[] = [];
  for (let i = 0; i < maxLabels; i += 1) {
    picked.push(points[Math.round(i * step)]);
  }
  return picked;
}

export default function BrokeragePerformanceChart({
  accountId,
  reportingCurrency,
  fallbackInvestedValue,
  liveInvestedValue,
  isLivePolling,
}: {
  accountId: string;
  reportingCurrency: string;
  fallbackInvestedValue: number;
  liveInvestedValue: number | null;
  isLivePolling: boolean;
}) {
  const [range, setRange] = useState<BrokeragePerformanceRange>(
    DEFAULT_PERFORMANCE_RANGE,
  );
  const [seriesByRange, setSeriesByRange] = useState<
    Partial<Record<BrokeragePerformanceRange, BrokeragePerformanceResponse>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const performance = seriesByRange[range] ?? null;

  const loadSeries = useEffectEvent(
    (targetRange: BrokeragePerformanceRange) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      fetchBrokeragePerformance(accountId, targetRange)
        .then((response) => {
          if (requestIdRef.current !== requestId) {
            return;
          }
          setSeriesByRange((current) => ({
            ...current,
            [targetRange]: response,
          }));
        })
        .catch((caught) => {
          if (requestIdRef.current !== requestId) {
            return;
          }
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load performance data.",
          );
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setIsLoading(false);
          }
        });
    },
  );

  // Load (or reload) the series whenever the selected range changes.
  useEffect(() => {
    loadSeries(range);
  }, [range]);

  const hasLiveInvestedValue = liveInvestedValue != null;
  const headerValue = hasLiveInvestedValue
    ? liveInvestedValue
    : (performance?.latestValue ?? fallbackInvestedValue);
  const changePercent = hasLiveInvestedValue
    ? computeLiveChangePercent(
        liveInvestedValue,
        performance?.baselineValue ?? null,
      )
    : (performance?.changePercent ?? null);
  const changeBadge = formatPerformanceChangeBadge(changePercent);

  const points = performance?.points ?? [];
  const geometry = buildPerformanceChartGeometry(
    points,
    performance?.baselineValue ?? null,
    CHART_VIEW_WIDTH,
    CHART_VIEW_HEIGHT,
  );
  const isPositive = changeBadge == null || changeBadge.direction !== "down";
  const lineColor = isPositive ? "var(--color-income)" : "var(--color-expense)";

  const axisLabelPoints = pickAxisLabelPoints(points, MAX_BOTTOM_LABELS);
  const isHistoricalProviderUnavailable =
    performance?.pricingStatus.state === "PARTIAL" && points.length === 0;

  const pricingNote =
    performance != null && performance.pricingStatus.state !== "FRESH"
      ? performance.pricingStatus.state === "PARTIAL"
        ? isHistoricalProviderUnavailable
          ? "The market-data provider did not return historical prices. Holdings and stored values are unaffected."
          : "Some positions are missing live prices; the chart reflects the latest available data."
        : "Latest stored prices are shown while brokerage data refreshes in the background."
      : null;

  return (
    <div className="brokerage-performance">
      <div className="brokerage-performance-head">
        <div className="brokerage-performance-value-row">
          <p className="brokerage-performance-value">
            <MoneyValue value={headerValue} currency={reportingCurrency} />
          </p>
          {isLivePolling ? (
            <span
              className="brokerage-live-dot"
              role="status"
              aria-label="Live prices updating"
              title="Live prices updating"
            />
          ) : null}
        </div>
        {changeBadge ? (
          <span
            className={`brokerage-performance-badge is-${changeBadge.direction}`}
          >
            <span className="brokerage-performance-badge-arrow" aria-hidden>
              {changeBadge.direction === "down" ? "▼" : "▲"}
            </span>
            {changeBadge.label}
          </span>
        ) : null}
      </div>

      <div
        className="brokerage-target-toggle-group brokerage-performance-ranges"
        role="group"
        aria-label="Performance range"
      >
        {PERFORMANCE_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`brokerage-target-toggle-option${
              range === option.value ? " is-active is-on" : ""
            }`}
            aria-pressed={range === option.value}
            onClick={() => setRange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="brokerage-performance-chart">
        {geometry ? (
          <>
            <svg
              className="brokerage-performance-svg"
              viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <line
                x1={0}
                x2={CHART_VIEW_WIDTH}
                y1={geometry.baselineY}
                y2={geometry.baselineY}
                stroke="var(--chart-axis)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <path
                d={geometry.linePath}
                fill="none"
                stroke={lineColor}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            {/* Rendered as HTML (not SVG text) so the labels aren't
                horizontally stretched by the chart's non-uniform
                preserveAspectRatio scaling. */}
            <div className="brokerage-performance-gridline-labels" aria-hidden>
              {geometry.gridlineLabels.map((gridline) => (
                <span
                  key={gridline.y}
                  className="brokerage-performance-gridline-label"
                  style={{
                    top: `${(gridline.y / CHART_VIEW_HEIGHT) * 100}%`,
                  }}
                >
                  {gridline.label}
                </span>
              ))}
            </div>
          </>
        ) : isLoading ? (
          <div
            className="brokerage-performance-skeleton animate-pulse"
            aria-busy="true"
            aria-live="polite"
          />
        ) : (
          <div className="brokerage-performance-empty">
            {isHistoricalProviderUnavailable
              ? "Historical performance is temporarily unavailable."
              : "Not enough data yet to chart this range."}
          </div>
        )}
      </div>

      {geometry && axisLabelPoints.length > 0 ? (
        <div className="brokerage-performance-axis">
          {axisLabelPoints.map((point) => (
            <span key={point.t}>
              {formatPerformanceAxisLabel(point.t, range)}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="brokerage-performance-note is-error">{error}</p>
      ) : pricingNote ? (
        <p className="brokerage-performance-note">{pricingNote}</p>
      ) : null}
    </div>
  );
}
