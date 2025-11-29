"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { formatCurrency } from "@lib/format";
import { COLORS } from "@lib/api-types";

const renderLabel = (props: PieLabelRenderProps) => {
  const { name, percent, x, y } = props;
  if (!percent || percent === 0) return null;
  return (
    <text
      x={x}
      y={y}
      fill="#111827"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: "12px", fontWeight: 500 }}
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
  <div className="flex items-center justify-center w-full">
    <ResponsiveContainer width={size} height={size}>
      <PieChart>
        ...
          <Pie
            data={cleaned}
            dataKey="total"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            stroke="#fff"
            strokeWidth={2}
          >
            {cleaned.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[entry.label as keyof typeof COLORS] || "#6B7280"}
              />
            ))}
          </Pie>

          {isSingle && single && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: "16px", fontWeight: 600, fill: "#111827" }}
            >
              {single.label} {" "}
              {((single.total / cleaned.reduce((s, d) => s + d.total, 0)) * 100).toFixed(0)}%
            </text>
          )}

          {!isSingle && (
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}