import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "@/api/passkeys/route";

const { authMock, hostedModeMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  hostedModeMock: vi.fn(),
  prismaMock: {
    authAuthenticator: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("/api/passkeys", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    prismaMock.authAuthenticator.deleteMany.mockReset();
    prismaMock.authAuthenticator.findMany.mockReset();
  });

  it("returns an empty list outside hosted mode", async () => {
    hostedModeMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("rejects hosted requests without a session", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Authentication is required.",
    });
  });

  it("lists passkeys for the current session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.authAuthenticator.findMany.mockResolvedValue([
      {
        credentialID: "credential-1",
        credentialDeviceType: "singleDevice",
        credentialBackedUp: true,
        transports: "internal",
        counter: 3,
        createdAt: new Date("2026-06-19T10:00:00.000Z"),
        updatedAt: new Date("2026-06-19T11:00:00.000Z"),
      },
    ]);

    const response = await GET();

    expect(prismaMock.authAuthenticator.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        credentialId: "credential-1",
        credentialDeviceType: "singleDevice",
        credentialBackedUp: true,
        transports: "internal",
        createdAt: "2026-06-19T10:00:00.000Z",
        lastUsedAt: "2026-06-19T11:00:00.000Z",
      },
    ]);
  });

  it("deletes passkeys only for the current session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.authAuthenticator.deleteMany.mockResolvedValue({ count: 1 });

    const response = await DELETE(
      new Request("https://finhance.test/api/passkeys", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://finhance.test",
        },
        body: JSON.stringify({ credentialId: "credential-1" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(prismaMock.authAuthenticator.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        credentialID: "credential-1",
      },
    });
  });
});
