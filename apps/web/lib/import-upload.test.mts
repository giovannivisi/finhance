import assert from "node:assert/strict";
import test from "node:test";
import {
  inferImportFileTypeFromHeaders,
  parseCsvHeaders,
} from "./import-upload.ts";

test("inferImportFileTypeFromHeaders matches transactions by exact header set", () => {
  const result = inferImportFileTypeFromHeaders([
    "importKey",
    "postedAt",
    "kind",
    "amount",
    "description",
    "notes",
    "accountImportKey",
    "direction",
    "categoryImportKey",
    "counterparty",
    "sourceAccountImportKey",
    "destinationAccountImportKey",
  ]);

  assert.equal(result.inferredFile, "transactions");
  assert.equal(result.reason, null);
  assert.equal(result.hint, null);
});

test("inferImportFileTypeFromHeaders accepts accounts without optional balance columns", () => {
  const result = inferImportFileTypeFromHeaders([
    "importKey",
    "name",
    "type",
    "currency",
    "institution",
    "notes",
    "order",
    "archived",
  ]);

  assert.equal(result.inferredFile, "accounts");
  assert.equal(result.reason, null);
});

test("inferImportFileTypeFromHeaders returns a closest-match hint for malformed files", () => {
  const result = inferImportFileTypeFromHeaders([
    "importKey",
    "postedAt",
    "kind",
    "amount",
    "description",
    "notes",
    "accountImportKey",
    "direction",
    "categoryImportKey",
    "counterparty",
    "wrongHeader",
  ]);

  assert.equal(result.inferredFile, null);
  assert.equal(result.reason, "Could not infer file category from headers.");
  assert.deepEqual(result.hint, {
    file: "transactions",
    matchedHeaders: 10,
    totalHeaders: 12,
  });
});

test("parseCsvHeaders trims a UTF-8 BOM and keeps comma-delimited headers intact", () => {
  const headers = parseCsvHeaders(
    "\uFEFFimportKey,postedAt,kind,amount,description\nvalue-1,2026-05-14T00:00:00.000Z,EXPENSE,2,Coffee\n",
  );

  assert.deepEqual(headers, [
    "importKey",
    "postedAt",
    "kind",
    "amount",
    "description",
  ]);
});
