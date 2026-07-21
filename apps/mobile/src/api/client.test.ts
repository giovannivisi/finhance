import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOBILE_SESSION_INVALID_CODE,
  buildUrl,
  createApiClient,
  generateIdempotencyKey,
  normalizeServerUrl,
} from "@/api/client";

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

describe("mobile API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes a rejected access token once and retries the original request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Mobile session is invalid or expired.",
            code: MOBILE_SESSION_INVALID_CODE,
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockResolvedValue("fresh-access-token");
    const client = createApiClient("https://finhance.test/api/proxy", {
      authToken: "expired-access-token",
      onUnauthorized: refresh,
    });

    await expect(client.request("/accounts")).resolves.toEqual({ ok: true });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer fresh-access-token",
        }),
      }),
    );
  });

  it("reuses the refreshed access token for later requests from the same client", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Mobile session is invalid or expired.",
            code: MOBILE_SESSION_INVALID_CODE,
          }),
          { status: 401 },
        ),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockResolvedValue("fresh-access-token");
    const client = createApiClient("https://finhance.test/api/proxy", {
      authToken: "expired-access-token",
      onUnauthorized: refresh,
    });

    await client.request("/passkey/options");
    await client.request("/passkey/verify");

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer fresh-access-token",
        }),
      }),
    );
  });
});
