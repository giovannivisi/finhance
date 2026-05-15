"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppPreferences } from "@components/ThemeProvider";
import type { MonthlyBudgetCurrencySummaryResponse } from "@finhance/shared";
import { formatSensitiveCurrency, formatSensitiveNumber } from "@lib/money";

export default function ReviewBudgetStatusChart({
  summaries,
}: {
  summaries: MonthlyBudgetCurrencySummaryResponse[];
}) {
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;
  const data = summaries.map((summary) => ({
    currency: summary.currency,
    budgetTotal: summary.budgetTotal,
    spentTotal: summary.spentTotal,
  }));

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart
          data={data}
          margin={{ top: 16, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" />
          <XAxis
            dataKey="currency"
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            width={110}
            tickFormatter={(value: number) =>
              formatSensitiveNumber(Number(value.toFixed(0)), shouldHideMoney)
            }
          />
          <Tooltip
            formatter={(
              value: number,
              _name: string,
              item: { payload?: { currency?: string } },
            ) =>
              formatSensitiveCurrency(
                value,
                item.payload?.currency ?? "EUR",
                shouldHideMoney,
              )
            }
            contentStyle={{
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--chart-tooltip-border)",
              background: "var(--chart-tooltip-bg)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-glass)",
            }}
          />
          <Legend />
          <Bar
            dataKey="budgetTotal"
            name="Budget"
            fill="var(--chart-budget)"
            radius={[8, 8, 0, 0]}
          />
          <Bar
            dataKey="spentTotal"
            name="Spent"
            fill="var(--chart-spent)"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
