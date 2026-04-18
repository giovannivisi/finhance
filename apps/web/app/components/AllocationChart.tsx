"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { formatCurrency } from "@lib/format";
import { COLORS } from "@lib/asset-ui";

const renderLabel = (props: PieLabelRenderProps) => {
  const { name, percent, x, y } = props;
  if (!percent || percent === 0) return null;
  return (
    <text
      x={x}
      y={y}
      fill="var(--text-primary)"
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fontSize: "14px",
        fontWeight: 600,
        fontFamily: "var(--font-heading)",
      }}
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

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
    <div className="flex-row items-center justify-center w-full">
      <ResponsiveContainer width="100%" height={size}>
        <PieChart>
          <Pie
            data={cleaned}
            dataKey="total"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            stroke="none"
            paddingAngle={4}
            cornerRadius={8}
            labelLine={false}
            label={isSingle ? false : renderLabel}
          >
            {cleaned.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  COLORS[entry.label as keyof typeof COLORS] ||
                  "var(--text-secondary)"
                }
              />
            ))}
          </Pie>

          {isSingle && single ? (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-primary)"
              style={{
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
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
                borderRadius: "16px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                backdropFilter: "blur(10px)",
                color: "var(--text-primary)",
              }}
              itemStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
