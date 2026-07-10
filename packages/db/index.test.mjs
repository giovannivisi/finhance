import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createPrismaAdapter as createEsmAdapter } from "./index.mjs";

const require = createRequire(import.meta.url);
const { createPrismaAdapter: createCommonJsAdapter } = require("./index.cjs");

for (const [entryPoint, createAdapter] of [
  ["ESM", createEsmAdapter],
  ["CommonJS", createCommonJsAdapter],
]) {
  test(`${entryPoint} adapter explicitly preserves the requested schema`, () => {
    const adapter = createAdapter(
      "postgresql://user:password@localhost:5432/finhance?schema=isolated%20schema",
    );

    assert.equal(adapter.options.schema, "isolated schema");
  });

  test(`${entryPoint} adapter leaves the default schema unset`, () => {
    const adapter = createAdapter(
      "postgresql://user:password@localhost:5432/finhance",
    );

    assert.equal(adapter.options?.schema, undefined);
  });
}
