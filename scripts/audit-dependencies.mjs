import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// pnpm 11.7.0 caps reported paths at 100 per package version. Treat a full
// list as incomplete: it could omit a path outside the permitted scope.
const SUPPORTED_PNPM_VERSION = "11.7.0";
const PATH_LIMIT = 100;
const EXCEPTION = "GHSA-mrhx-c7xc-m3w5";
const REVIEW_BY = "2026-11-11";

export function evaluateAudit(report, exitCode, today = new Date()) {
  if (
    !report ||
    typeof report !== "object" ||
    !report.advisories ||
    typeof report.advisories !== "object" ||
    Array.isArray(report.advisories) ||
    !report.metadata?.vulnerabilities
  ) {
    throw new Error("The dependency audit did not return a complete report.");
  }

  const counts = report.metadata.vulnerabilities;
  if (
    !Number.isSafeInteger(counts.high) ||
    counts.high < 0 ||
    !Number.isSafeInteger(counts.critical) ||
    counts.critical < 0
  ) {
    throw new Error(
      "The dependency audit severity counts are missing or invalid.",
    );
  }

  const advisories = Object.values(report.advisories);
  const high = advisories.filter((item) => item?.severity === "high").length;
  const critical = advisories.filter(
    (item) => item?.severity === "critical",
  ).length;
  if (
    high !== counts.high ||
    critical !== counts.critical ||
    high + critical !== advisories.length ||
    exitCode !== (advisories.length > 0 ? 1 : 0)
  ) {
    throw new Error(
      "The dependency audit results are incomplete or inconsistent.",
    );
  }

  let acceptedPaths = 0;
  for (const advisory of advisories) {
    if (
      advisory.github_advisory_id !== EXCEPTION ||
      advisory.module_name !== "zod" ||
      advisory.severity !== "high" ||
      !Array.isArray(advisory.findings) ||
      advisory.findings.length === 0
    ) {
      throw new Error("The dependency audit contains an unapproved advisory.");
    }
    if (today.toISOString().slice(0, 10) > REVIEW_BY) {
      throw new Error(`The ${EXCEPTION} exception expired after ${REVIEW_BY}.`);
    }
    for (const finding of advisory.findings) {
      if (
        finding?.version !== "3.25.76" ||
        !Array.isArray(finding.paths) ||
        finding.paths.length === 0 ||
        finding.paths.length >= PATH_LIMIT ||
        finding.paths.some((path) => {
          if (typeof path !== "string") return true;
          const parts = path.split(">");
          return (
            parts.length < 3 ||
            parts[0] !== "apps__mobile" ||
            parts.at(-2) !== "@expo/cli" ||
            parts.at(-1) !== "zod"
          );
        })
      ) {
        throw new Error(
          `${EXCEPTION} has an unapproved, missing or potentially truncated dependency path.`,
        );
      }
      acceptedPaths += finding.paths.length;
    }
  }
  return { acceptedPaths };
}

function run() {
  const version = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
  if (
    version.error ||
    version.status !== 0 ||
    version.stdout.trim() !== SUPPORTED_PNPM_VERSION
  ) {
    throw new Error(
      `The audit policy requires pnpm ${SUPPORTED_PNPM_VERSION}; review its path limit before upgrading.`,
    );
  }

  // Do not ignore registry errors: an unavailable audit is not a passing one.
  const result = spawnSync("pnpm", ["audit", "--audit-level=high", "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error("The dependency audit could not be completed.");
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error("The dependency audit did not return valid JSON.");
  }
  // Print the complete high/critical report, including the accepted advisory.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const { acceptedPaths } = evaluateAudit(report, result.status);
  if (acceptedPaths) {
    console.log(
      `Temporarily accepted ${EXCEPTION} for ${acceptedPaths} Expo CLI paths; review by ${REVIEW_BY} UTC.`,
    );
  } else {
    console.log(
      `No ${EXCEPTION} exception was needed; remove it when Expo no longer requires the affected dependency.`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    run();
  } catch (error) {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
