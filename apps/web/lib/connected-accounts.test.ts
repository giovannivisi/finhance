// @vitest-environment node

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  LastSignInMethodError,
  deleteConnectedAccountForUser,
  getUserIdentityForUser,
  listConnectedAccountsForUser,
} from "./connected-accounts";
import { prisma } from "./prisma";

type PrismaMock = {
  user: {
    findUnique: Mock;
  };
  authProviderAccount: {
    count: Mock;
    delete: Mock;
    findFirst: Mock;
  };
  authAuthenticator: {
    count: Mock;
  };
  $transaction: Mock;
};

vi.mock("server-only", () => ({}));

vi.mock("./prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    authProviderAccount: {
      count: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    authAuthenticator: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const prismaMock = prisma as unknown as PrismaMock;

describe("connected account helpers", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.authProviderAccount.count.mockReset();
    prismaMock.authProviderAccount.delete.mockReset();
    prismaMock.authProviderAccount.findFirst.mockReset();
    prismaMock.authAuthenticator.count.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation(
      (callback: (tx: PrismaMock) => unknown) => callback(prismaMock),
    );
  });

  it("maps connected provider accounts for display", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "person@example.com",
      providerAccounts: [
        {
          id: "account-1",
          provider: "google",
          providerEmail: "PERSON@example.com",
          providerEmailVerified: true,
          providerDisplayName: "Person",
          createdAt: new Date("2026-07-09T10:00:00.000Z"),
        },
      ],
    });

    await expect(listConnectedAccountsForUser("user-1")).resolves.toEqual([
      {
        id: "account-1",
        provider: "google",
        providerLabel: "Google",
        providerEmail: "person@example.com",
        providerEmailVerified: true,
        providerDisplayName: "Person",
        createdAt: "2026-07-09T10:00:00.000Z",
        isPrimaryEmail: true,
      },
    ]);
  });

  it("loads identity and connected accounts with one user query", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "person@example.com",
      name: "Person",
      image: "https://example.com/person.png",
      providerAccounts: [
        {
          id: "account-1",
          provider: "github",
          providerEmail: "PERSON@example.com",
          providerEmailVerified: true,
          providerDisplayName: "person",
          createdAt: new Date("2026-07-09T10:00:00.000Z"),
        },
      ],
    });

    await expect(getUserIdentityForUser("user-1")).resolves.toEqual({
      email: "person@example.com",
      name: "Person",
      image: "https://example.com/person.png",
      connectedAccounts: [
        {
          id: "account-1",
          provider: "github",
          providerLabel: "GitHub",
          providerEmail: "person@example.com",
          providerEmailVerified: true,
          providerDisplayName: "person",
          createdAt: "2026-07-09T10:00:00.000Z",
          isPrimaryEmail: true,
        },
      ],
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it("prevents removing the last sign-in method", async () => {
    prismaMock.authProviderAccount.findFirst.mockResolvedValue({
      id: "account-1",
    });
    prismaMock.authProviderAccount.count.mockResolvedValue(1);
    prismaMock.authAuthenticator.count.mockResolvedValue(0);

    await expect(
      deleteConnectedAccountForUser({
        userId: "user-1",
        accountId: "account-1",
      }),
    ).rejects.toBeInstanceOf(LastSignInMethodError);
    expect(prismaMock.authProviderAccount.delete).not.toHaveBeenCalled();
  });

  it("removes an OAuth method when another method remains", async () => {
    prismaMock.authProviderAccount.findFirst.mockResolvedValue({
      id: "account-1",
    });
    prismaMock.authProviderAccount.count.mockResolvedValue(1);
    prismaMock.authAuthenticator.count.mockResolvedValue(1);

    await deleteConnectedAccountForUser({
      userId: "user-1",
      accountId: "account-1",
    });

    expect(prismaMock.authProviderAccount.delete).toHaveBeenCalledWith({
      where: { id: "account-1" },
    });
  });
});
