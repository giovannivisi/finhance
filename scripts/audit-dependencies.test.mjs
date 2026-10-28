import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit } from "./audit-dependencies.mjs";

const reviewDay = new Date("2026-11-11T23:59:59Z");
const permittedPath = "apps__mobile>expo>@expo/cli>zod";

function report(advisories = []) {
  return {
    advisories: Object.fromEntries(advisories.map((item, i) => [i, item])),
    metadata: {
      vulnerabilities: {
        high: advisories.filter((item) => item.severity === "high").length,
        critical: advisories.filter((item) => item.severity === "critical")
          .length,
      },
    },
  };
}

function zod(paths = [permittedPath]) {
  return {
    github_advisory_id: "GHSA-mrhx-c7xc-m3w5",
    module_name: "zod",
    severity: "high",
    findings: [{ version: "3.25.76", paths }],
  };
}

test("passes a complete audit with no high or critical advisories", () => {
  assert.deepEqual(evaluateAudit(report(), 0, reviewDay), { acceptedPaths: 0 });
});

test("accepts only the documented Zod finding on Expo CLI paths", () => {
  const paths = [permittedPath, "apps__mobile>expo-router>expo>@expo/cli>zod"];
  assert.deepEqual(evaluateAudit(report([zod(paths)]), 1, reviewDay), {
    acceptedPaths: 2,
  });
});

test("rejects any affected path outside the permitted direct CLI dependency", () => {
  for (const path of [
    "apps__web>zod",
    "apps__web>expo>@expo/cli>zod",
    "apps__mobile>other>zod",
    "apps__mobile>expo>@expo/cli>other>zod",
    "apps__mobile>expo>fake@expo/cli>zod",
    "apps__mobile>expo>@expo/cli>not-zod",
    null,
  ]) {
    assert.throws(() =>
      evaluateAudit(report([zod([permittedPath, path])]), 1, reviewDay),
    );
  }
});

test("rejects missing paths, unknown versions and potentially truncated path lists", () => {
  assert.throws(() => evaluateAudit(report([zod([])]), 1, reviewDay));
  const unknownVersion = zod();
  unknownVersion.findings[0].version = "3.25.77";
  assert.throws(() => evaluateAudit(report([unknownVersion]), 1, reviewDay));
  assert.throws(() =>
    evaluateAudit(report([zod(Array(100).fill(permittedPath))]), 1, reviewDay),
  );
  assert.doesNotThrow(() =>
    evaluateAudit(report([zod(Array(99).fill(permittedPath))]), 1, reviewDay),
  );
});

test("rejects another high or critical advisory even alongside the exception", () => {
  for (const severity of ["high", "critical"]) {
    const other = {
      github_advisory_id: "GHSA-other",
      module_name: "other",
      severity,
    };
    assert.throws(() => evaluateAudit(report([zod(), other]), 1, reviewDay));
  }
});

test("rejects the exception after its review date", () => {
  assert.throws(() =>
    evaluateAudit(report([zod()]), 1, new Date("2026-11-12T00:00:00Z")),
  );
});

test("fails closed on missing, inconsistent or filtered audit results", () => {
  const missingPaths = zod();
  delete missingPaths.findings[0].paths;
  const wrongPackage = { ...zod(), module_name: "other" };
  const hiddenHigh = report();
  hiddenHigh.metadata.vulnerabilities.high = 1;
  for (const [data, exitCode] of [
    [null, 1],
    [{ error: { message: "registry unavailable" } }, 0],
    [{ advisories: {}, metadata: {} }, 0],
    [report([missingPaths]), 1],
    [report([wrongPackage]), 1],
    [hiddenHigh, 0],
    [report([zod()]), 0],
    [report(), 1],
    [report(), 2],
  ]) {
    assert.throws(() => evaluateAudit(data, exitCode, reviewDay));
  }
});
