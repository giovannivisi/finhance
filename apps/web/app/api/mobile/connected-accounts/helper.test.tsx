import { beforeEach, describe, expect, it, vi } from "vitest";

const { PrismaClientKnownRequestErrorMock, prismaMock } = vi.hoisted(() => {
  class PrismaClientKnownRequestErrorMock extends Error {
    code: string;

    constructor(message: string, options: { code: string }) {
      super(message);
      this.code = options.code;
    }
  }

  return {
    PrismaClientKnownRequestErrorMock,
    prismaMock: {
      $transaction: vi.fn(),
      authProviderAccount: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@finhance/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: PrismaClientKnownRequestErrorMock,
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

vi.mock("@lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  ConnectedAccountAlreadyLinkedError,
  linkConnectedAccountForUser,
} from "@lib/connected-accounts";

describe("mobile provider-link persistence", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockReset();
    prismaMock.authProviderAccount.findUnique.mockReset();
    prismaMock.authProviderAccount.update.mockReset();
    prismaMock.user.findUnique.mockReset();
  });

  it("treats a concurrent same-user unique conflict as an idempotent refresh", async () => {
    prismaMock.$transaction.mockRejectedValue(
      new PrismaClientKnownRequestErrorMock("unique conflict", {
        code: "P2002",
      }),
    );
    prismaMock.user.findUnique.mockResolvedValue({
      email: "person@example.com",
      isActive: true,
    });
    prismaMock.authProviderAccount.findUnique.mockResolvedValue({
      id: "account-1",
      userId: "user-1",
      provider: "google",
      providerEmail: "old@example.com",
      providerEmailVerified: true,
      providerDisplayName: "Old name",
      createdAt: new Date("2026-07-09T10:00:00.000Z"),
    });
    prismaMock.authProviderAccount.update.mockResolvedValue({
      id: "account-1",
      provider: "google",
      providerEmail: "person@example.com",
      providerEmailVerified: true,
      providerDisplayName: "Person",
      createdAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    await expect(
      linkConnectedAccountForUser({
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-user-1",
        metadata: {
          providerEmail: "person@example.com",
          providerEmailVerified: true,
          providerDisplayName: "Person",
        },
      }),
    ).resolves.toMatchObject({
      id: "account-1",
      provider: "google",
      providerEmail: "person@example.com",
    });
    expect(prismaMock.authProviderAccount.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: {
        providerEmail: "person@example.com",
        providerEmailVerified: true,
        providerDisplayName: "Person",
      },
      select: expect.any(Object),
    });
  });

  it("does not reassign a provider identity after a concurrent unique conflict", async () => {
    prismaMock.$transaction.mockRejectedValue(
      new PrismaClientKnownRequestErrorMock("unique conflict", {
        code: "P2002",
      }),
    );
    prismaMock.user.findUnique.mockResolvedValue({
      email: "person@example.com",
      isActive: true,
    });
    prismaMock.authProviderAccount.findUnique.mockResolvedValue({
      id: "account-1",
      userId: "other-user",
      provider: "google",
      providerEmail: "other@example.com",
      providerEmailVerified: true,
      providerDisplayName: "Other",
      createdAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    await expect(
      linkConnectedAccountForUser({
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-user-1",
        metadata: {
          providerEmail: "person@example.com",
          providerEmailVerified: true,
          providerDisplayName: "Person",
        },
      }),
    ).rejects.toBeInstanceOf(ConnectedAccountAlreadyLinkedError);
    expect(prismaMock.authProviderAccount.update).not.toHaveBeenCalled();
  });
});
