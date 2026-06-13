import { describe, expect, it } from "vitest";
import type { ImportBatchResponse } from "@finhance/shared";

import {
  groupImportSummaries,
  importStatusTone,
  sortImportBatches,
  totalImportRows,
} from "./imports";

function batch(
  overrides: Partial<ImportBatchResponse> = {},
): ImportBatchResponse {
  return {
    id: "batch",
    source: "CSV_TEMPLATE",
    status: "PREVIEW",
    summary: {
      files: [],
      errorCount: 0,
      warningCount: 0,
    },
    issues: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    appliedAt: null,
    ...overrides,
  };
}

describe("groupImportSummaries", () => {
  it("groups import files into foundation, activity, and planning sections", () => {
    const groups = groupImportSummaries({
      files: [
        {
          file: "transactions",
          createCount: 2,
          updateCount: 0,
          unchangedCount: 1,
        },
        {
          file: "accounts",
          createCount: 1,
          updateCount: 0,
          unchangedCount: 0,
        },
        {
          file: "budgets",
          createCount: 3,
          updateCount: 0,
          unchangedCount: 0,
        },
      ],
      errorCount: 0,
      warningCount: 0,
    });

    expect(
      groups.map((group) => [group.id, group.files.map((file) => file.file)]),
    ).toEqual([
      ["foundation", ["accounts"]],
      ["activity", ["transactions"]],
      ["planning", ["budgets"]],
    ]);
  });
});

describe("totalImportRows", () => {
  it("counts create, update, and unchanged rows", () => {
    expect(
      totalImportRows({
        files: [
          {
            file: "accounts",
            createCount: 1,
            updateCount: 2,
            unchangedCount: 3,
          },
          {
            file: "transactions",
            createCount: 4,
            updateCount: 0,
            unchangedCount: 1,
          },
        ],
        errorCount: 0,
        warningCount: 0,
      }),
    ).toBe(11);
  });
});

describe("importStatusTone", () => {
  it("prioritises applied, failed/errors, warnings, then neutral", () => {
    const cleanSummary = { files: [], errorCount: 0, warningCount: 0 };

    expect(importStatusTone("APPLIED", cleanSummary)).toBe("success");
    expect(importStatusTone("FAILED", cleanSummary)).toBe("danger");
    expect(
      importStatusTone("PREVIEW", {
        files: [],
        errorCount: 1,
        warningCount: 0,
      }),
    ).toBe("danger");
    expect(
      importStatusTone("PREVIEW", {
        files: [],
        errorCount: 0,
        warningCount: 1,
      }),
    ).toBe("warning");
    expect(importStatusTone("PREVIEW", cleanSummary)).toBe("neutral");
  });
});

describe("sortImportBatches", () => {
  it("orders newest batches first", () => {
    expect(
      sortImportBatches([
        batch({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }),
        batch({ id: "newer", createdAt: "2026-01-02T00:00:00.000Z" }),
      ]).map((entry) => entry.id),
    ).toEqual(["newer", "older"]);
  });
});
