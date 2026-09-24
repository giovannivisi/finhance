import { DELETE } from "@/api/proxy/[...path]/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, fetchMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@lib/auth", () => ({ auth: authMock }));
vi.mock("@lib/api-auth", () => ({
  getDirectApiUrl: vi.fn((path: string) => `https://api.test${path}`),
  InvalidApiPathError: class InvalidApiPathError extends Error {},
  mintApiAccessToken: vi.fn(),
}));
vi.mock("@lib/auth-mode", () => ({ isHostedAuthMode: vi.fn(() => true) }));
vi.mock("@lib/local-request", () => ({
  resolveLocalRequestRejection: vi.fn(() => null),
}));
vi.mock("@lib/mobile-auth", () => ({
  resolveMobileBearerUser: vi.fn(),
}));
vi.mock("@lib/proxy-auth", () => ({
  resolveProxyAuthorization: vi.fn(),
}));
vi.mock("@lib/server-api-cache", () => ({
  clearServerApiCacheForUser: vi.fn(),
  getServerApiCacheUserKey: vi.fn(),
}));

describe("generic API proxy", () => {
  beforeEach(() => {
    authMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does not forward account deletion around the protected route", async () => {
    const response = await DELETE(
      new Request("https://finhance.test/api/proxy/users/me?confirm=true", {
        method: "DELETE",
        headers: { origin: "https://finhance.test" },
      }),
      { params: Promise.resolve({ path: ["users", "me"] }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Use the protected account deletion endpoint.",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
