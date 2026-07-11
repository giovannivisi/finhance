import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/api/auth/[...nextauth]/route";

const {
  authMock,
  clearWebProviderLinkIntentCookieMock,
  handlersGetMock,
  handlersPostMock,
  recentAuthMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  clearWebProviderLinkIntentCookieMock: vi.fn(),
  handlersGetMock: vi.fn(),
  handlersPostMock: vi.fn(),
  recentAuthMock: vi.fn(),
}));

vi.mock("@lib/web-provider-link", () => ({
  clearWebProviderLinkIntentCookie: clearWebProviderLinkIntentCookieMock,
  WEB_PROVIDER_LINK_COOKIE: "finhance.provider-link",
}));

vi.mock("@lib/auth", () => ({
  auth: authMock,
  handlers: {
    GET: handlersGetMock,
    POST: handlersPostMock,
  },
}));

vi.mock("@lib/recent-auth", () => ({
  RECENT_AUTH_REQUIRED_MESSAGE:
    "Sign in again before changing sign-in methods.",
  hasRecentSessionAuthentication: recentAuthMock,
}));

describe("/api/auth", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    handlersGetMock.mockReset();
    handlersGetMock.mockResolvedValue(Response.json({ ok: true }));
    handlersPostMock.mockReset();
    recentAuthMock.mockReset();
    recentAuthMock.mockResolvedValue(true);
    clearWebProviderLinkIntentCookieMock.mockReset();
    clearWebProviderLinkIntentCookieMock.mockReturnValue(
      "finhance.provider-link=; Path=/api/auth; Max-Age=0",
    );
  });

  it("delegates ordinary Auth.js GET requests", async () => {
    const request = new Request("https://finhance.test/api/auth/session");

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(authMock).not.toHaveBeenCalled();
    expect(handlersGetMock).toHaveBeenCalledWith(request);
  });

  it("rejects passkey registration options without recent authentication", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    recentAuthMock.mockResolvedValue(false);

    const response = await GET(
      new Request(
        "https://finhance.test/api/auth/webauthn-options/passkey?action=register",
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Sign in again before changing sign-in methods.",
    });
    expect(handlersGetMock).not.toHaveBeenCalled();
  });

  it("allows passkey registration options after recent authentication", async () => {
    const request = new Request(
      "https://finhance.test/api/auth/webauthn-options/passkey?action=register",
    );
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    recentAuthMock.mockResolvedValue(true);

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(recentAuthMock).toHaveBeenCalledWith("user-1");
    expect(handlersGetMock).toHaveBeenCalledWith(request);
  });

  it("clears a web provider-link intent after an OAuth callback", async () => {
    const request = new Request(
      "https://finhance.test/api/auth/callback/github",
      { headers: { cookie: "finhance.provider-link=signed-intent" } },
    );

    const response = await GET(request);

    expect(clearWebProviderLinkIntentCookieMock).toHaveBeenCalledWith(request);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
