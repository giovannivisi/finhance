"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { formatCurrency } from "@lib/format";
import { COLORS } from "@lib/asset-ui";

export default function AllocationChart({
  data,
  size = 400,
}: {
  data: { label: string; total: number }[];
  size?: number;
}) {
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
            outerRadius={90}
            stroke="none"
            strokeWidth={0}
            labelLine={false}
            label={false}
          >
            {cleaned.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[entry.label as keyof typeof COLORS] || "#6B7280"}
              />
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
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: "#18181b",
                borderColor: "rgba(255,255,255,0.05)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "12px",
                padding: "8px 12px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              }}
              itemStyle={{ color: "#fff" }}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
