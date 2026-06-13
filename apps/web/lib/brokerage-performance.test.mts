import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPerformanceChartGeometry,
  formatPerformanceAxisLabel,
  formatPerformanceChangeBadge,
  formatPerformancePercentLabel,
} from "./brokerage-performance.ts";

test("formatPerformanceAxisLabel formats 1D points as clock hours (Europe/Rome)", () => {
  const t = Date.UTC(2026, 5, 12, 9, 30);
  // June is CEST (UTC+2), so 09:30 UTC is 11:30 in Europe/Rome.
  assert.equal(formatPerformanceAxisLabel(t, "1D"), "11:30");
});

test("formatPerformanceAxisLabel formats 1W and 1M points as day + month", () => {
  const t = Date.UTC(2026, 5, 8, 0, 0);
  assert.equal(formatPerformanceAxisLabel(t, "1W"), "8 Jun");
  assert.equal(formatPerformanceAxisLabel(t, "1M"), "8 Jun");
});

test("formatPerformanceAxisLabel formats 1Y points as month abbreviations", () => {
  const t = Date.UTC(2026, 5, 12, 0, 0);
  assert.equal(formatPerformanceAxisLabel(t, "1Y"), "Jun");
});

test("formatPerformanceAxisLabel formats MAX points as years", () => {
  const t = Date.UTC(2024, 0, 1, 0, 0);
  assert.equal(formatPerformanceAxisLabel(t, "MAX"), "2024");
});

test("formatPerformancePercentLabel signs positive and negative deviations", () => {
  assert.equal(formatPerformancePercentLabel(2.34), "+2.3%");
  assert.equal(formatPerformancePercentLabel(-1.0), "-1.0%");
});

test("formatPerformancePercentLabel renders values that round to zero as 0%", () => {
  assert.equal(formatPerformancePercentLabel(0), "0%");
  assert.equal(formatPerformancePercentLabel(0.02), "0%");
  assert.equal(formatPerformancePercentLabel(-0.02), "0%");
});

test("formatPerformanceChangeBadge reports direction and magnitude", () => {
  assert.deepEqual(formatPerformanceChangeBadge(1.234), {
    direction: "up",
    label: "1.23%",
  });
  assert.deepEqual(formatPerformanceChangeBadge(-0.8), {
    direction: "down",
    label: "0.80%",
  });
  assert.deepEqual(formatPerformanceChangeBadge(0), {
    direction: "flat",
    label: "0.00%",
  });
});

test("formatPerformanceChangeBadge returns null when the change is unknown", () => {
  assert.equal(formatPerformanceChangeBadge(null), null);
});

test("buildPerformanceChartGeometry returns null for fewer than two points", () => {
  assert.equal(buildPerformanceChartGeometry([], 100, 400, 260), null);
  assert.equal(
    buildPerformanceChartGeometry([{ t: 0, value: 100 }], 100, 400, 260),
    null,
  );
});

test("buildPerformanceChartGeometry builds a line path spanning the full width", () => {
  const points = [
    { t: 0, value: 100 },
    { t: 1000, value: 110 },
    { t: 2000, value: 105 },
  ];

  const geometry = buildPerformanceChartGeometry(points, 100, 400, 260);

  assert.ok(geometry);
  assert.equal(geometry!.points.length, 3);
  assert.equal(geometry!.points[0].x, 0);
  assert.equal(geometry!.points[2].x, 400);
  assert.ok(geometry!.linePath.startsWith("M0.00,"));
});

test("buildPerformanceChartGeometry places the baseline below the line when latest exceeds baseline", () => {
  const points = [
    { t: 0, value: 100 },
    { t: 1000, value: 110 },
  ];

  const geometry = buildPerformanceChartGeometry(points, 100, 400, 260);

  assert.ok(geometry);
  // y=0 is the top of the viewBox, so a higher value has a smaller y.
  // The baseline (100) is below the final point (110), i.e. larger y.
  assert.ok(geometry!.baselineY > geometry!.points[1].y);
});

test("buildPerformanceChartGeometry produces four evenly spaced gridline labels", () => {
  const points = [
    { t: 0, value: 100 },
    { t: 1000, value: 120 },
  ];

  const geometry = buildPerformanceChartGeometry(points, 100, 400, 260);

  assert.ok(geometry);
  assert.equal(geometry!.gridlineLabels.length, 4);
  assert.equal(geometry!.gridlineLabels[0].y, 0);
  assert.equal(geometry!.gridlineLabels[3].y, 260);
  // The top gridline corresponds to the highest value (120 vs baseline 100).
  assert.equal(geometry!.gridlineLabels[0].label, "+20.0%");
  // The bottom gridline corresponds to the lowest value (100 == baseline).
  assert.equal(geometry!.gridlineLabels[3].label, "0%");
});

test("buildPerformanceChartGeometry falls back to the first point when baselineValue is null", () => {
  const points = [
    { t: 0, value: 100 },
    { t: 1000, value: 110 },
  ];

  const geometry = buildPerformanceChartGeometry(points, null, 400, 260);

  assert.ok(geometry);
  // Baseline falls back to the first point's value (100), same as the
  // explicit-baseline case above.
  assert.equal(geometry!.gridlineLabels[3].label, "0%");
});
