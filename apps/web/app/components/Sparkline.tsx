type SparklinePoint = { value: number };

export default function Sparkline({
  points,
  tone = "neutral",
  width = 120,
  height = 32,
}: {
  points: SparklinePoint[];
  tone?: "expense" | "income" | "neutral";
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return null;
  }

  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const padding = 3;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : padding + (index / (points.length - 1)) * innerWidth;
    const y = padding + (1 - (point.value - min) / range) * innerHeight;
    return { x, y };
  });

  const linePath = coords
    .map((coord, index) =>
      `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`,
    )
    .join(" ");
  const baselineY = height - padding;
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(2)},${baselineY} L${coords[0].x.toFixed(2)},${baselineY} Z`;

  const stroke =
    tone === "income"
      ? "#10b981"
      : tone === "expense"
        ? "#e11d48"
        : "#0284c7";
  const last = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="flex-shrink-0"
    >
      <path d={areaPath} fill={stroke} fillOpacity={0.12} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2} fill={stroke} />
    </svg>
  );
}
