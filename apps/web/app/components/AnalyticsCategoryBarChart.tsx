"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CashflowAnalyticsBreakdownItemResponse,
  CashflowAnalyticsMonthOverMonthChangeResponse,
} from "@finhance/shared";
import { formatCurrency } from "@lib/format";

type BreakdownChartData = Array<CashflowAnalyticsBreakdownItemResponse>;
type MoversChartData = Array<
  CashflowAnalyticsMonthOverMonthChangeResponse & { absoluteDelta: number }
>;

export default function AnalyticsCategoryBarChart({
  currency,
  data,
  mode,
}: {
  currency: string;
  data: BreakdownChartData | MoversChartData;
  mode: "breakdown" | "movers";
}) {
  const chartData =
    mode === "breakdown"
      ? (data as BreakdownChartData).map((item) => ({
          name: item.name,
          value: item.total,
        }))
      : (data as MoversChartData).map((item) => ({
          name: item.name,
          value: item.delta,
        }));

  const barColor = mode === "breakdown" ? "#e11d48" : "#0284c7";

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
        >
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
          <XAxis
            type="number"
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatCurrency(value, currency)}
          />
          <YAxis
            dataKey="name"
            type="category"
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value, currency)}
            contentStyle={{
              borderRadius: "1rem",
              border: "1px solid #e5e7eb",
            }}
          />
          <Bar dataKey="value" fill={barColor} radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
