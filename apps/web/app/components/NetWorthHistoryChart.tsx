"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetWorthSnapshotResponse } from "@finhance/shared";
import { formatCurrency } from "@lib/format";

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
});

function formatSnapshotDate(snapshotDate: string): string {
  return DATE_LABEL_FORMATTER.format(new Date(`${snapshotDate}T00:00:00.000Z`));
}

export default function NetWorthHistoryChart({
  snapshots,
  baseCurrency,
}: {
  snapshots: NetWorthSnapshotResponse[];
  baseCurrency: string;
}) {
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={320} minWidth={0}>
        <LineChart
          data={snapshots}
          margin={{ top: 16, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
          <XAxis
            dataKey="snapshotDate"
            tickFormatter={formatSnapshotDate}
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#6b7280"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              formatCurrency(value, baseCurrency)
            }
            width={110}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value, baseCurrency)}
            labelFormatter={(label) => formatSnapshotDate(String(label))}
            contentStyle={{
              borderRadius: "1rem",
              border: "1px solid #e5e7eb",
            }}
          />
          <Line
            type="monotone"
            dataKey="netWorthTotal"
            stroke="#111827"
            strokeWidth={3}
            dot={{ r: 4, fill: "#111827" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
