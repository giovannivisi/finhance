import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";

import { AppText } from "@/components/ui";
import { formatShortMonthLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
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
              accessibilityLabel={`${formatShortMonthLabel(point.month)}: in ${point.income}, out ${point.expense}`}
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
                {formatShortMonthLabel(point.month).split(" ")[0]}
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
            {formatShortMonthLabel(selected.month)}
          </AppText>
          <AppText variant="caption" tone="income" tabular>
            +
            {formatMoney(selected.income, currency, {
              hide: hideMoney,
              maximumFractionDigits: 0,
              signDisplay: "never",
            })}
          </AppText>
          <AppText variant="caption" tone="expense" tabular>
            −
            {formatMoney(selected.expense, currency, {
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
            {formatMoney(selected.net, currency, {
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
              {formatMoney(item.value, currency, {
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
