import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertLocalPrismaTestDatabaseUrl } from "./prisma-test-safety.cjs";

const require = createRequire(import.meta.url);

test("loads through both ESM import and CommonJS require", () => {
  const commonJsSafety = require("./prisma-test-safety.cjs");

  assert.equal(
    commonJsSafety.assertLocalPrismaTestDatabaseUrl,
    assertLocalPrismaTestDatabaseUrl,
  );
});

test("accepts loopback PostgreSQL database URLs", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.doesNotThrow(() =>
      assertLocalPrismaTestDatabaseUrl(
        `postgresql://user:password@${hostname}:5432/finhance_test`,
      ),
    );
  }
});

test("rejects remote PostgreSQL database URLs", () => {
  assert.throws(
    () =>
      assertLocalPrismaTestDatabaseUrl(
        "postgresql://user:password@production.example.com/finhance",
      ),
    /Refusing to run Prisma integration tests against non-local database host/,
  );
});

test("rejects malformed database URLs", () => {
  assert.throws(
    () => assertLocalPrismaTestDatabaseUrl("not-a-database-url"),
    /valid local DATABASE_URL/,
  );
});
