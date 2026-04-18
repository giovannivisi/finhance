"use client";

import { useTheme } from "next-themes";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

// Mock historical data for the spline chart since we don't have historical portfolio data yet
const data = [
  { date: "Jan", value: 12100000 },
  { date: "Feb", value: 12500000 },
  { date: "Mar", value: 12400000 },
  { date: "Apr", value: 12800000 },
  { date: "May", value: 13200000 },
  { date: "Jun", value: 13100000 },
  { date: "Jul", value: 13500000 },
  { date: "Aug", value: 13900000 },
  { date: "Sep", value: 14000000 },
  { date: "Oct", value: 14250000 },
];

export function PortfolioChart({ currentValue }: { currentValue: number }) {
  const { theme } = useTheme();

  // To make it look dynamic, we'll set the last data point to the actual current value
  const chartData = [...data];
  chartData[chartData.length - 1].value = currentValue;

  const isDark = theme === "dark";
  const strokeColor = "var(--accent-primary)";
  const gradientStart = isDark
    ? "rgba(46, 213, 115, 0.2)"
    : "rgba(46, 213, 115, 0.3)";
  const gradientEnd = isDark
    ? "rgba(46, 213, 115, 0)"
    : "rgba(46, 213, 115, 0)";

  return (
    <div className="w-full h-64 mt-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gradientStart} stopOpacity={1} />
              <stop offset="95%" stopColor={gradientEnd} stopOpacity={1} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="glass-card" style={{ padding: "8px 12px" }}>
                    <p className="text-body font-bold text-primary">
                      ${(payload[0].value as number).toLocaleString()}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorValue)"
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
