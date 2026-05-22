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
import { useAppPreferences } from "@components/ThemeProvider";
import type { NetWorthSnapshotResponse } from "@finhance/shared";
import { formatSensitiveCurrency } from "@lib/money";

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
});

function formatSnapshotDate(snapshotDate: string): string {
  return DATE_LABEL_FORMATTER.format(new Date(`${snapshotDate}T00:00:00.000Z`));
}

export default function NetWorthHistoryChart({
  snapshots,
  reportingCurrency,
}: {
  snapshots: NetWorthSnapshotResponse[];
  reportingCurrency: string;
}) {
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={320} minWidth={0}>
        <LineChart
          data={snapshots}
          margin={{ top: 16, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" />
          <XAxis
            dataKey="snapshotDate"
            tickFormatter={formatSnapshotDate}
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              formatSensitiveCurrency(value, reportingCurrency, shouldHideMoney)
            }
            width={110}
          />
          <Tooltip
            formatter={(value: number) =>
              formatSensitiveCurrency(
                value,
                reportingCurrency,
                shouldHideMoney,
              )
            }
            labelFormatter={(label) => formatSnapshotDate(String(label))}
            contentStyle={{
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--chart-tooltip-border)",
              background: "var(--chart-tooltip-bg)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-glass)",
            }}
          />
          <Line
            type="monotone"
            dataKey="netWorthTotal"
            stroke="var(--chart-history)"
            strokeWidth={3}
            dot={{ r: 4, fill: "var(--chart-history)" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
