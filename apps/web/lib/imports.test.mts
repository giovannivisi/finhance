import assert from "node:assert/strict";
import test from "node:test";
import {
  getImportReadiness,
  groupImportSummaries,
  splitImportIssues,
} from "./imports.ts";

test("groupImportSummaries arranges files into foundation, activity, and planning groups", () => {
  const groups = groupImportSummaries({
    files: [
      {
        file: "transactions",
        createCount: 2,
        updateCount: 0,
        unchangedCount: 1,
      },
      { file: "accounts", createCount: 1, updateCount: 0, unchangedCount: 0 },
      { file: "budgets", createCount: 3, updateCount: 0, unchangedCount: 0 },
    ],
    errorCount: 0,
    warningCount: 0,
  });

  assert.deepEqual(
    groups.map((group) => [group.id, group.files.map((file) => file.file)]),
    [
      ["foundation", ["accounts"]],
      ["activity", ["transactions"]],
      ["planning", ["budgets"]],
    ],
  );
});

test("getImportReadiness prioritizes blocked, then warnings, then ready", () => {
  assert.equal(
    getImportReadiness({
      canApply: false,
      summary: { files: [], errorCount: 2, warningCount: 1 },
    }).tone,
    "blocked",
  );
  assert.equal(
    getImportReadiness({
      canApply: true,
      summary: { files: [], errorCount: 0, warningCount: 3 },
    }).tone,
    "warning",
  );
  assert.equal(
    getImportReadiness({
      canApply: true,
      summary: { files: [], errorCount: 0, warningCount: 0 },
    }).tone,
    "ready",
  );
});

test("splitImportIssues separates errors from warnings", () => {
  const result = splitImportIssues([
    {
      file: "accounts",
      rowNumber: 2,
      field: "name",
      severity: "ERROR",
      message: "Missing",
    },
    {
      file: "transactions",
      rowNumber: 4,
      field: null,
      severity: "WARNING",
      message: "Suspicious",
    },
  ]);

  assert.equal(result.errors.length, 1);
  assert.equal(result.warnings.length, 1);
});
