import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import type {
  BrokeragePerformancePointResponse,
  BrokeragePerformanceRange,
} from "@finhance/shared";

import { AppText } from "@/components/ui";
import {
  buildAxisTimeLabels,
  computePercentGridlines,
  formatAxisTimeLabel,
  isPerformancePositive,
} from "@/lib/performance-chart";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

export interface MonthlyFlowPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

function niceCeil(value: number): number {
  if (value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export interface MonthlyFlowChartProps {
  points: MonthlyFlowPoint[];
  currency: string;
  height?: number;
}

/** Paired income/expense bars per month with a selectable detail row. */
export function MonthlyFlowChart({
  points,
  currency,
  height = 170,
}: MonthlyFlowChartProps) {
  const { colors, hideMoney } = useTheme();
  const format = useFormatters();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  const maxValue = niceCeil(
    Math.max(
      1,
      ...points.map((point) => Math.max(point.income, point.expense)),
    ),
  );

  const chartHeight = height - 26;
  const groupCount = Math.max(points.length, 1);
  const groupWidth = width > 0 ? width / groupCount : 0;
  const barWidth = Math.max(3, Math.min(13, groupWidth * 0.26));
  const gridLines = [0.25, 0.5, 0.75, 1];

  const selected = selectedIndex !== null ? points[selectedIndex] : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {gridLines.map((fraction) => (
              <Line
                key={fraction}
                x1={0}
                x2={width}
                y1={chartHeight - chartHeight * fraction}
                y2={chartHeight - chartHeight * fraction}
                stroke={colors.chartGrid}
                strokeWidth={1}
              />
            ))}
            {points.map((point, index) => {
              const centre = groupWidth * index + groupWidth / 2;
              const incomeHeight = (point.income / maxValue) * chartHeight;
              const expenseHeight = (point.expense / maxValue) * chartHeight;
              const dimmed = selectedIndex !== null && selectedIndex !== index;

              return (
                <G key={point.month}>
                  <Rect
                    x={centre - barWidth - 1.5}
                    y={chartHeight - incomeHeight}
                    width={barWidth}
                    height={Math.max(incomeHeight, point.income > 0 ? 2 : 0)}
                    rx={2.5}
                    fill={colors.chartIncome}
                    opacity={dimmed ? 0.35 : 1}
                  />
                  <Rect
                    x={centre + 1.5}
                    y={chartHeight - expenseHeight}
                    width={barWidth}
                    height={Math.max(expenseHeight, point.expense > 0 ? 2 : 0)}
                    rx={2.5}
                    fill={colors.chartExpense}
                    opacity={dimmed ? 0.35 : 1}
                  />
                </G>
              );
            })}
            <Line
              x1={0}
              x2={width}
              y1={chartHeight}
              y2={chartHeight}
              stroke={colors.chartAxis}
              strokeWidth={1}
            />
          </Svg>
        ) : null}

        {/* Touch + labels overlay */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: "row",
          }}
        >
          {points.map((point, index) => (
            <Pressable
              key={point.month}
              accessibilityRole="button"
              accessibilityLabel={`${format.shortMonth(point.month)}: in ${point.income}, out ${point.expense}`}
              onPress={() =>
                setSelectedIndex(selectedIndex === index ? null : index)
              }
              style={{ flex: 1, justifyContent: "flex-end" }}
            >
              <AppText
                variant="caption"
                tone={selectedIndex === index ? "primary" : "tertiary"}
                style={{ textAlign: "center", fontSize: 9.5 }}
                numberOfLines={1}
              >
                {format.shortMonth(point.month).split(" ")[0]}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>

      {selected ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: colors.bgCardMuted,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            gap: spacing.md,
          }}
        >
          <AppText variant="caption" tone="secondary">
            {format.shortMonth(selected.month)}
          </AppText>
          <AppText variant="caption" tone="income" tabular>
            +
            {format.money(selected.income, currency, {
              hide: hideMoney,
              maximumFractionDigits: 0,
              signDisplay: "never",
            })}
          </AppText>
          <AppText variant="caption" tone="expense" tabular>
            −
            {format.money(selected.expense, currency, {
              hide: hideMoney,
              maximumFractionDigits: 0,
              signDisplay: "never",
            })}
          </AppText>
          <AppText
            variant="caption"
            tone={selected.net >= 0 ? "income" : "expense"}
            tabular
          >
            net{" "}
            {format.money(selected.net, currency, {
              hide: hideMoney,
              maximumFractionDigits: 0,
              signDisplay: "exceptZero",
            })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export interface BreakdownDatum {
  key: string;
  label: string;
  value: number;
}

export interface BreakdownBarsProps {
  data: BreakdownDatum[];
  currency: string;
  tone?: "expense" | "income";
  maxItems?: number;
}

/** Horizontal proportion bars for category breakdowns. */
export function BreakdownBars({
  data,
  currency,
  tone = "expense",
  maxItems = 8,
}: BreakdownBarsProps) {
  const { colors, hideMoney } = useTheme();
  const format = useFormatters();
  const items = data.slice(0, maxItems);
  const max = Math.max(1, ...items.map((item) => item.value));
  const fill = tone === "expense" ? colors.chartExpense : colors.chartIncome;

  return (
    <View style={{ gap: spacing.md }}>
      {items.map((item) => (
        <View key={item.key} style={{ gap: 4 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: spacing.md,
            }}
          >
            <AppText
              variant="footnote"
              tone="secondary"
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {item.label}
            </AppText>
            <AppText variant="footnoteMedium" tabular>
              {format.money(item.value, currency, {
                hide: hideMoney,
                maximumFractionDigits: 0,
              })}
            </AppText>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.bgControl,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${(item.value / max) * 100}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor: fill,
                opacity: 0.85,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export interface AllocationDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface AllocationDonutChartProps {
  data: AllocationDatum[];
  currency: string;
  size?: number;
  strokeWidth?: number;
  totalLabel?: string;
  maxLegendItems?: number;
}

/** Donut chart with a compact legend for portfolio allocation snapshots. */
export function AllocationDonutChart({
  data,
  currency,
  size = 150,
  strokeWidth = 18,
  totalLabel = "Total",
  maxLegendItems = 6,
}: AllocationDonutChartProps) {
  const { colors, hideMoney } = useTheme();
  const format = useFormatters();
  const cleaned = data.filter((item) => item.value > 0);
  const total = cleaned.reduce((sum, item) => sum + item.value, 0);
  const radius = size / 2 - strokeWidth / 2 - 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const palette = [
    colors.chartIncome,
    colors.chartNeutral,
    colors.chartSpent,
    colors.warning,
    colors.chartExpense,
    colors.chartBudget,
    colors.info,
    colors.primary,
  ];

  const items = cleaned.map((item, index) => ({
    ...item,
    color: item.color ?? palette[index % palette.length],
    percent: total > 0 ? (item.value / total) * 100 : 0,
  }));

  if (items.length === 0) {
    return (
      <View
        style={{
          minHeight: 96,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText variant="footnote" tone="tertiary">
          No allocation data yet.
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.lg,
        flexWrap: "wrap",
      }}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={colors.bgControl}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <G rotation={-90} origin={`${centre}, ${centre}`}>
            {items.map((item) => {
              const arc = (item.value / total) * circumference;
              const dashOffset = -offset;
              offset += arc;

              return (
                <Circle
                  key={item.key}
                  cx={centre}
                  cy={centre}
                  r={radius}
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${arc} ${circumference - arc}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                  fill="none"
                />
              );
            })}
          </G>
        </Svg>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: spacing.md,
          }}
        >
          <AppText variant="caption" tone="tertiary" numberOfLines={1}>
            {totalLabel}
          </AppText>
          <AppText variant="footnoteMedium" numberOfLines={1} tabular>
            {format.money(total, currency, {
              hide: hideMoney,
              maximumFractionDigits: 0,
            })}
          </AppText>
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 150, gap: spacing.sm }}>
        {items.slice(0, maxLegendItems).map((item) => (
          <View key={item.key} style={{ gap: 3 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: item.color,
                  }}
                />
                <AppText
                  variant="footnoteMedium"
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {item.label}
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" tabular>
                {item.percent.toFixed(0)}%
              </AppText>
            </View>
            <AppText
              variant="caption"
              tone="tertiary"
              numberOfLines={1}
              style={{ paddingLeft: 8 + spacing.sm }}
            >
              {format.money(item.value, currency, {
                hide: hideMoney,
                maximumFractionDigits: 0,
              })}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: "expense" | "income" | "neutral";
}

export function Sparkline({
  values,
  width = 86,
  height = 26,
  tone = "neutral",
}: SparklineProps) {
  const { colors } = useTheme();

  if (values.length < 2) {
    return <View style={{ width, height }} />;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((value, index) => ({
    x: index * stepX,
    y: height - 3 - ((value - min) / range) * (height - 6),
  }));
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(" ");

  const stroke =
    tone === "expense"
      ? colors.chartExpense
      : tone === "income"
        ? colors.chartIncome
        : colors.chartNeutral;

  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={stroke} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

/** Small pulsing dot shown while live price polling is active. */
export function LiveDot() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.chartIncome,
        opacity,
      }}
    />
  );
}

export interface PerformanceChartProps {
  points: BrokeragePerformancePointResponse[];
  range: BrokeragePerformanceRange;
  baselineValue: number | null;
  latestValue: number | null;
  currency: string;
  height?: number;
  emptyMessage?: string;
}

/**
 * Portfolio performance line chart: a thin green/red line (green when the
 * latest value is at or above the baseline), a dotted baseline reference,
 * right-edge percent-deviation gridlines, and bottom time-axis labels
 * appropriate for the selected range.
 */
export function PerformanceChart({
  points,
  range,
  baselineValue,
  latestValue,
  currency,
  height = 240,
  emptyMessage = "No performance data for this range yet.",
}: PerformanceChartProps) {
  const { colors, hideMoney } = useTheme();
  const format = useFormatters();
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const labelGutter = 44; // reserved for right-edge percent labels
  const axisHeight = 22; // reserved for bottom time labels
  const chartWidth = Math.max(0, width - labelGutter);
  const chartHeight = height - axisHeight;

  const gridlines = computePercentGridlines(points, baselineValue);
  const axisLabels = buildAxisTimeLabels(points, range);
  const latestPerformanceValue =
    points.length > 0
      ? (points[points.length - 1]?.value ?? null)
      : latestValue;
  const positive = isPerformancePositive(latestPerformanceValue, baselineValue);
  const lineColor = positive ? colors.chartIncome : colors.chartExpense;

  if (points.length === 0) {
    return (
      <View
        style={{
          height,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText variant="footnote" tone="tertiary">
          {emptyMessage}
        </AppText>
      </View>
    );
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values, baselineValue ?? values[0]!);
  const max = Math.max(...values, baselineValue ?? values[0]!);
  const valueRange = max - min || 1;

  const xOf = (index: number) =>
    points.length > 1 ? (index / (points.length - 1)) * chartWidth : 0;
  const yOf = (value: number) =>
    chartHeight - ((value - min) / valueRange) * chartHeight;

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)},${yOf(point.value).toFixed(1)}`,
    )
    .join(" ");

  const selected = selectedIndex !== null ? points[selectedIndex] : null;
  const baselineY = baselineValue !== null ? yOf(baselineValue) : null;

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {/* Right-edge percent-deviation gridlines */}
            {gridlines.map((gridline, index) => (
              <Line
                key={index}
                x1={0}
                x2={chartWidth}
                y1={yOf(gridline.value)}
                y2={yOf(gridline.value)}
                stroke={colors.chartGrid}
                strokeWidth={1}
              />
            ))}

            {/* Dotted baseline reference */}
            {baselineY !== null ? (
              <Line
                x1={0}
                x2={chartWidth}
                y1={baselineY}
                y2={baselineY}
                stroke={colors.chartAxis}
                strokeWidth={1}
                strokeDasharray="2,4"
              />
            ) : null}

            {/* Performance line */}
            <Path
              d={linePath}
              stroke={lineColor}
              strokeWidth={2.5}
              fill="none"
            />

            {/* Selected point marker */}
            {selected ? (
              <Circle
                cx={xOf(selectedIndex!)}
                cy={yOf(selected.value)}
                r={3.5}
                fill={lineColor}
              />
            ) : null}
          </Svg>
        ) : null}

        {/* Right-edge percent labels */}
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: axisHeight,
            width: labelGutter,
          }}
        >
          {gridlines.map((gridline, index) => (
            <AppText
              key={index}
              variant="caption"
              tone="tertiary"
              numberOfLines={1}
              style={{
                position: "absolute",
                right: 2,
                top: yOf(gridline.value) - 7,
                textAlign: "right",
              }}
            >
              {gridline.label}
            </AppText>
          ))}
        </View>

        {/* Touch overlay for point selection */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: chartWidth,
            bottom: axisHeight,
            flexDirection: "row",
          }}
        >
          {points.map((point, index) => (
            <Pressable
              key={point.t}
              accessibilityRole="button"
              accessibilityLabel={`${format.money(point.value, currency, { hide: hideMoney })}`}
              onPress={() =>
                setSelectedIndex(selectedIndex === index ? null : index)
              }
              style={{ flex: 1 }}
            />
          ))}
        </View>

        {/* Bottom time-axis labels */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: labelGutter,
            bottom: 0,
            height: axisHeight,
          }}
        >
          {axisLabels.map(({ index, label }) => {
            const isFirst = index === 0;
            const isLast = index === points.length - 1;
            const x = xOf(index);

            return (
              <AppText
                key={index}
                variant="caption"
                tone="tertiary"
                numberOfLines={1}
                style={{
                  position: "absolute",
                  top: 4,
                  left: isFirst ? 0 : isLast ? undefined : x - 18,
                  right: isLast ? 0 : undefined,
                  width: isFirst || isLast ? undefined : 36,
                  textAlign: isFirst ? "left" : isLast ? "right" : "center",
                }}
              >
                {label}
              </AppText>
            );
          })}
        </View>
      </View>

      {selected ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: colors.bgCardMuted,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            gap: spacing.md,
          }}
        >
          <AppText variant="caption" tone="secondary">
            {formatAxisTimeLabel(selected.t, range)}
          </AppText>
          <AppText variant="caption" tabular>
            {format.money(selected.value, currency, { hide: hideMoney })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
