import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "@/api/mobile/sessions/route";

const {
  authMock,
  hostedModeMock,
  listMobileSessionsMock,
  revokeAllMobileSessionsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  hostedModeMock: vi.fn(),
  listMobileSessionsMock: vi.fn(),
  revokeAllMobileSessionsMock: vi.fn(),
}));

vi.mock("@lib/api-proxy", () => ({
  resolveCrossOriginRejection: () => null,
}));
vi.mock("@lib/auth", () => ({ auth: authMock }));
vi.mock("@lib/auth-mode", () => ({ isHostedAuthMode: hostedModeMock }));
vi.mock("@lib/mobile-auth", () => ({
  listMobileSessions: listMobileSessionsMock,
  resolveMobileBearerUser: vi.fn(),
  revokeAllMobileSessions: revokeAllMobileSessionsMock,
}));

describe("mobile session routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user-123" } });
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    listMobileSessionsMock.mockReset();
    revokeAllMobileSessionsMock.mockReset();
  });

  it("lists only the signed-in user's active mobile sessions", async () => {
    listMobileSessionsMock.mockResolvedValue([
      {
        id: "session-123",
        deviceLabel: "iOS device",
        authenticatedAt: "2026-07-21T10:00:00.000Z",
        createdAt: "2026-07-21T10:00:00.000Z",
        lastUsedAt: "2026-07-21T10:01:00.000Z",
        expiresAt: "2026-08-20T10:00:00.000Z",
        isCurrent: false,
      },
    ]);

    const response = await GET(
      new Request("https://finhance.test/api/mobile/sessions"),
    );

    expect(response.status).toBe(200);
    expect(listMobileSessionsMock).toHaveBeenCalledWith("user-123", null);
    expect(await response.json()).toHaveLength(1);
  });

  it("revokes all sessions only for the signed-in user", async () => {
    const response = await DELETE(
      new Request("https://finhance.test/api/mobile/sessions", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(204);
    expect(revokeAllMobileSessionsMock).toHaveBeenCalledWith("user-123");
  });
});
