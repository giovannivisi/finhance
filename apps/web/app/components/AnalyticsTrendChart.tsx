"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppPreferences } from "@components/ThemeProvider";
import type { CashflowAnalyticsMonthPointResponse } from "@finhance/shared";
import { formatSensitiveCurrency } from "@lib/money";

export default function AnalyticsTrendChart({
  data,
  currency,
}: {
  data: CashflowAnalyticsMonthPointResponse[];
  currency: string;
}) {
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={320} minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" />
          <XAxis
            dataKey="month"
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            width={100}
            tickFormatter={(value: number) =>
              formatSensitiveCurrency(value, currency, shouldHideMoney)
            }
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatSensitiveCurrency(value, currency, shouldHideMoney),
              name,
            ]}
            contentStyle={{
              borderRadius: "1rem",
              border: "1px solid var(--chart-tooltip-border)",
              background: "var(--chart-tooltip-bg)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-glass)",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="incomeTotal"
            name="Income"
            stroke="var(--chart-income)"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="expenseTotal"
            name="Expense"
            stroke="var(--chart-expense)"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="netCashflow"
            name="Net"
            stroke="var(--chart-neutral)"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
