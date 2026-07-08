"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  type MouseHandlerDataParam,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppPreferences } from "@components/ThemeProvider";
import { formatSensitiveCurrency } from "@lib/money";

type BreakdownChartDatum = {
  name: string;
  total: number;
  chartLabel?: string;
  href?: string;
  selectionKey?: string;
};

type MoversChartDatum = {
  name: string;
  delta: number;
  chartLabel?: string;
  href?: string;
  selectionKey?: string;
};

type BreakdownChartData = BreakdownChartDatum[];
type MoversChartData = MoversChartDatum[];

type InteractiveChartDatum = {
  href?: string;
  selectionKey?: string;
};

function stopChartEventPropagation(event: unknown): void {
  if (
    typeof event === "object" &&
    event !== null &&
    "stopPropagation" in event &&
    typeof event.stopPropagation === "function"
  ) {
    event.stopPropagation();
  }
}

export default function AnalyticsCategoryBarChart({
  currency,
  data,
  mode,
  tone = "auto",
  onBarSelect,
  selectedKey = null,
}: {
  currency: string;
  data: BreakdownChartData | MoversChartData;
  mode: "breakdown" | "movers";
  tone?: "auto" | "expense" | "income" | "neutral";
  onBarSelect?: (key: string) => void;
  selectedKey?: string | null;
}) {
  const router = useRouter();
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;
  const chartData =
    mode === "breakdown"
      ? (data as BreakdownChartData).map((item) => ({
          name: item.chartLabel ?? item.name,
          value: item.total,
          href: item.href,
          selectionKey: item.selectionKey,
        }))
      : (data as MoversChartData).map((item) => ({
          name: item.chartLabel ?? item.name,
          value: item.delta,
          href: item.href,
          selectionKey: item.selectionKey,
        }));

  const hasClickableBars = chartData.some(
    (item) =>
      typeof item.href === "string" || typeof item.selectionKey === "string",
  );
  const resolvedTone =
    tone === "auto" ? (mode === "breakdown" ? "expense" : "neutral") : tone;
  const barColor =
    resolvedTone === "income"
      ? "#10b981"
      : resolvedTone === "neutral"
        ? "#0284c7"
        : "#e11d48";
  const selectedBarColor =
    resolvedTone === "income"
      ? "#34d399"
      : resolvedTone === "neutral"
        ? "#38bdf8"
        : "#fb7185";
  const dimmedBarColor =
    resolvedTone === "income"
      ? "#0f766e"
      : resolvedTone === "neutral"
        ? "#0369a1"
        : "#9f1239";

  function resolveChartDatumFromState(
    state: MouseHandlerDataParam,
  ): InteractiveChartDatum | undefined {
    const rawIndex = state.activeTooltipIndex;
    const resolvedIndex =
      typeof rawIndex === "number"
        ? rawIndex
        : typeof rawIndex === "string"
          ? Number.parseInt(rawIndex, 10)
          : Number.NaN;

    if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0) {
      return undefined;
    }

    return chartData[resolvedIndex];
  }

  function handleChartSelection(entry?: InteractiveChartDatum) {
    if (entry?.selectionKey && onBarSelect) {
      onBarSelect(entry.selectionKey);
      return;
    }

    if (entry?.href) {
      router.push(entry.href);
    }
  }

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
          onClick={(state: MouseHandlerDataParam) => {
            handleChartSelection(resolveChartDatumFromState(state));
          }}
        >
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" />
          <XAxis
            type="number"
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              formatSensitiveCurrency(value, currency, shouldHideMoney)
            }
          />
          <YAxis
            dataKey="name"
            type="category"
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            width={120}
            interval={0}
          />
          <Tooltip
            formatter={(value: number) =>
              formatSensitiveCurrency(value, currency, shouldHideMoney)
            }
            contentStyle={{
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--chart-tooltip-border)",
              background: "var(--chart-tooltip-bg)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-glass)",
            }}
          />
          <Bar
            dataKey="value"
            fill={barColor}
            radius={[0, 8, 8, 0]}
            cursor={hasClickableBars ? "pointer" : "default"}
            onClick={(
              entry: InteractiveChartDatum,
              _index: number,
              event: unknown,
            ) => {
              stopChartEventPropagation(event);
              handleChartSelection(entry);
            }}
          >
            {chartData.map((item) => {
              const isSelected =
                Boolean(selectedKey) && item.selectionKey === selectedKey;
              const isDimmed =
                Boolean(selectedKey) &&
                item.selectionKey !== selectedKey &&
                item.selectionKey !== undefined;

              return (
                <Cell
                  key={`bar-${item.name}-${item.selectionKey ?? "default"}`}
                  fill={
                    isSelected
                      ? selectedBarColor
                      : isDimmed
                        ? dimmedBarColor
                        : barColor
                  }
                  fillOpacity={isSelected ? 1 : isDimmed ? 0.58 : 0.9}
                  stroke={
                    isSelected ? "var(--chart-tooltip-border)" : "transparent"
                  }
                  strokeWidth={isSelected ? 2 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
