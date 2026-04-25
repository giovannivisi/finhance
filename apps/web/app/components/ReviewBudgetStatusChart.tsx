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
import type { MonthlyBudgetCurrencySummaryResponse } from "@finhance/shared";
import { formatCurrency } from "@lib/format";

export default function ReviewBudgetStatusChart({
  summaries,
}: {
  summaries: MonthlyBudgetCurrencySummaryResponse[];
}) {
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
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
          <XAxis
            dataKey="currency"
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
            width={110}
            tickFormatter={(value: number) => value.toFixed(0)}
          />
          <Tooltip
            formatter={(
              value: number,
              _name: string,
              item: { payload?: { currency?: string } },
            ) => formatCurrency(value, item.payload?.currency ?? "EUR")}
            contentStyle={{
              borderRadius: "1rem",
              border: "1px solid #e5e7eb",
            }}
          />
          <Legend />
          <Bar
            dataKey="budgetTotal"
            name="Budget"
            fill="#94a3b8"
            radius={[8, 8, 0, 0]}
          />
          <Bar
            dataKey="spentTotal"
            name="Spent"
            fill="#2563eb"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
