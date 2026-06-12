import { describe, expect, it } from "vitest";

import { buildUrl, generateIdempotencyKey, normalizeServerUrl } from "./client";

describe("normalizeServerUrl", () => {
  it("adds http:// when the scheme is missing", () => {
    expect(normalizeServerUrl("192.168.1.10:3000")).toBe(
      "http://192.168.1.10:3000",
    );
  });

  it("keeps https and strips trailing slashes", () => {
    expect(normalizeServerUrl("https://api.example.com/ ")).toBe(
      "https://api.example.com",
    );
    expect(normalizeServerUrl("http://host:3000/base/")).toBe(
      "http://host:3000/base",
    );
  });

  it("rejects empty and unparseable values", () => {
    expect(normalizeServerUrl("")).toBeNull();
    expect(normalizeServerUrl("   ")).toBeNull();
    expect(normalizeServerUrl("ftp://host")).toBeNull();
    expect(normalizeServerUrl("http://")).toBeNull();
  });
});

describe("buildUrl", () => {
  it("joins paths and keeps the base path prefix", () => {
    expect(buildUrl("http://host:3000", "/transactions")).toBe(
      "http://host:3000/transactions",
    );
    expect(buildUrl("http://host:3000/base", "health")).toBe(
      "http://host:3000/base/health",
    );
  });

  it("serialises defined query values only", () => {
    expect(
      buildUrl("http://host", "/transactions", {
        from: "2026-06-01",
        to: undefined,
        limit: 500,
        includeArchivedAccounts: true,
        empty: "",
      }),
    ).toBe(
      "http://host/transactions?from=2026-06-01&limit=500&includeArchivedAccounts=true",
    );
  });
});

describe("generateIdempotencyKey", () => {
  it("produces unique uuid-shaped keys", () => {
    const first = generateIdempotencyKey();
    const second = generateIdempotencyKey();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(first).not.toBe(second);
  });
});
