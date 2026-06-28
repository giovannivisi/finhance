import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/api/account/route";

const { authMock, fetchServerApiMock, hostedModeMock, recentAuthMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    fetchServerApiMock: vi.fn(),
    hostedModeMock: vi.fn(),
    recentAuthMock: vi.fn(),
  }));

vi.mock("@lib/auth", () => ({ auth: authMock }));
vi.mock("@lib/auth-mode", () => ({ isHostedAuthMode: hostedModeMock }));
vi.mock("@lib/recent-auth", () => ({
  RECENT_AUTH_REQUIRED_MESSAGE: "Sign in again before continuing.",
  hasRecentSessionAuthentication: recentAuthMock,
}));
vi.mock("@lib/server-api", () => ({ fetchServerApi: fetchServerApiMock }));

function buildRequest(email = "person@example.com") {
  return new Request("https://finhance.test/api/account", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "delete-user-1",
      origin: "https://finhance.test",
    },
    body: JSON.stringify({ email }),
  });
}

describe("/api/account", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    fetchServerApiMock.mockReset();
    fetchServerApiMock.mockResolvedValue(new Response(null, { status: 204 }));
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    recentAuthMock.mockReset();
    recentAuthMock.mockResolvedValue(true);
  });

  it("is unavailable outside hosted mode", async () => {
    hostedModeMock.mockReturnValue(false);

    const response = await DELETE(buildRequest());

    expect(response.status).toBe(404);
    expect(fetchServerApiMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    authMock.mockResolvedValue(null);

    const response = await DELETE(buildRequest());

    expect(response.status).toBe(401);
    expect(fetchServerApiMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin deletion requests", async () => {
    const request = buildRequest();
    request.headers.set("origin", "https://attacker.test");

    const response = await DELETE(request);

    expect(response.status).toBe(403);
    expect(authMock).not.toHaveBeenCalled();
    expect(fetchServerApiMock).not.toHaveBeenCalled();
  });

  it("requires recent authentication", async () => {
    recentAuthMock.mockResolvedValue(false);

    const response = await DELETE(buildRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Sign in again before continuing.",
    });
    expect(fetchServerApiMock).not.toHaveBeenCalled();
  });

  it("forwards the confirmation payload to the API", async () => {
    const response = await DELETE(buildRequest());

    expect(response.status).toBe(204);
    expect(fetchServerApiMock).toHaveBeenCalledWith("/users/me", {
      method: "DELETE",
      headers: expect.any(Headers),
      body: JSON.stringify({ email: "person@example.com" }),
    });
    const requestHeaders = fetchServerApiMock.mock.calls[0]?.[1]
      ?.headers as Headers;
    expect(requestHeaders.get("content-type")).toBe("application/json");
    expect(requestHeaders.get("idempotency-key")).toBe("delete-user-1");
  });
});
