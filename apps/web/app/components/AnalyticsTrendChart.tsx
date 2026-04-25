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
import type { CashflowAnalyticsMonthPointResponse } from "@finhance/shared";
import { formatCurrency } from "@lib/format";

export default function AnalyticsTrendChart({
  data,
  currency,
}: {
  data: CashflowAnalyticsMonthPointResponse[];
  currency: string;
}) {
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={320} minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
          <XAxis
            dataKey="month"
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
            width={100}
            tickFormatter={(value: number) => formatCurrency(value, currency)}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatCurrency(value, currency),
              name,
            ]}
            contentStyle={{
              borderRadius: "1rem",
              border: "1px solid #e5e7eb",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="incomeTotal"
            name="Income"
            stroke="#059669"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="expenseTotal"
            name="Expense"
            stroke="#e11d48"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="netCashflow"
            name="Net"
            stroke="#0284c7"
            strokeWidth={3}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
