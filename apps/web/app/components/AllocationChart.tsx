"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { formatCurrency } from "@lib/format";

const COLORS = [
  "#4F46E5", // Indigo
  "#16A34A", // Green
  "#DC2626", // Red
  "#F59E0B", // Amber
  "#0EA5E9", // Sky
  "#EC4899", // Pink
  "#7C3AED", // Violet
];
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
}: {
  data: { category: string; total: number }[];
}) {
  const cleaned = data.filter((d) => d.total > 0);
  const isSingle = cleaned.length === 1;
  const single = isSingle ? cleaned[0] : null;

  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={cleaned}
            dataKey="total"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            stroke="#fff"
            strokeWidth={2}
          >
            {cleaned.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
              {single.category} {" "}
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