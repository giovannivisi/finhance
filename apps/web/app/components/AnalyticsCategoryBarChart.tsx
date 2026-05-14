"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppPreferences } from "@components/ThemeProvider";
import type {
  CashflowAnalyticsBreakdownItemResponse,
  CashflowAnalyticsMonthOverMonthChangeResponse,
} from "@finhance/shared";
import { formatSensitiveCurrency } from "@lib/money";

type BreakdownChartDatum = CashflowAnalyticsBreakdownItemResponse & {
  chartLabel?: string;
  href?: string;
};
type MoversChartDatum = CashflowAnalyticsMonthOverMonthChangeResponse & {
  absoluteDelta: number;
  chartLabel?: string;
  href?: string;
};

type BreakdownChartData = Array<BreakdownChartDatum>;
type MoversChartData = Array<
  MoversChartDatum
>;

export default function AnalyticsCategoryBarChart({
  currency,
  data,
  mode,
  tone = "auto",
}: {
  currency: string;
  data: BreakdownChartData | MoversChartData;
  mode: "breakdown" | "movers";
  tone?: "auto" | "expense" | "income" | "neutral";
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
        }))
      : (data as MoversChartData).map((item) => ({
          name: item.chartLabel ?? item.name,
          value: item.delta,
          href: item.href,
        }));

  const hasClickableBars = chartData.some((item) => typeof item.href === "string");
  const resolvedTone =
    tone === "auto"
      ? mode === "breakdown"
        ? "expense"
        : "neutral"
      : tone;
  const barColor =
    resolvedTone === "income"
      ? "#10b981"
      : resolvedTone === "neutral"
        ? "#0284c7"
        : "#e11d48";

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
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
          />
          <Tooltip
            formatter={(value: number) =>
              formatSensitiveCurrency(value, currency, shouldHideMoney)
            }
            contentStyle={{
              borderRadius: "1rem",
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
            onClick={(entry: { href?: string } | undefined) => {
              if (entry?.href) {
                router.push(entry.href);
              }
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
