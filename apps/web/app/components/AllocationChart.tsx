"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAppPreferences } from "@components/ThemeProvider";
import { formatSensitiveCurrency } from "@lib/money";

export default function AllocationChart({
  data,
  size = 400,
  currency = "EUR",
}: {
  data: { label: string; total: number; color?: string }[];
  size?: number;
  currency?: string;
}) {
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;
  const cleaned = data.filter((d) => d.total > 0);
  const isSingle = cleaned.length === 1;
  const single = isSingle ? cleaned[0] : null;

  return (
    <div className="flex items-center justify-center w-full">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={cleaned}
            dataKey="total"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={5}
            cornerRadius={10}
            stroke="none"
            strokeWidth={0}
            labelLine={false}
            label={false}
          >
            {cleaned.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color ?? "#6B7280"} />
            ))}
          </Pie>

          {isSingle && single ? (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: "16px",
                fontWeight: 600,
                fill: "var(--text-primary)",
              }}
            >
              {single.label}{" "}
              {(
                (single.total /
                  cleaned.reduce((sum, item) => sum + item.total, 0)) *
                100
              ).toFixed(0)}
              %
            </text>
          ) : null}

          {!isSingle ? (
            <Tooltip
              formatter={(value: number) =>
                formatSensitiveCurrency(
                  value,
                  currency,
                  shouldHideMoney,
                  "Unavailable",
                )
              }
              contentStyle={{
                backgroundColor: "var(--chart-tooltip-bg)",
                borderColor: "var(--chart-tooltip-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "12px",
                padding: "8px 12px",
                boxShadow: "var(--shadow-glass)",
              }}
              itemStyle={{ color: "var(--text-primary)" }}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
