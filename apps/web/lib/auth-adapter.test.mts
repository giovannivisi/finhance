import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { AdapterAccount } from "next-auth/adapters";
import { FinhanceAuthAdapter } from "./auth-adapter-core.ts";

function hashStoredAuthToken(
  token: string,
  purpose: "session" | "verification",
): string {
  return createHash("sha256")
    .update(`finhance:auth-token:${purpose}:${token}`)
    .digest("hex");
}

test("linkAccount persists only the provider identity fields", async () => {
  let createInput: unknown;
  const adapter = FinhanceAuthAdapter({
    authProviderAccount: {
      create: async (input: unknown) => {
        createInput = input;
        return input;
      },
    },
  } as never);

  await adapter.linkAccount?.({
    userId: "user-1",
    type: "oauth",
    provider: "github" as Lowercase<string>,
    providerAccountId: "provider-user",
    refresh_token: "refresh",
    access_token: "access",
    expires_at: 123,
    token_type: "bearer" as Lowercase<string>,
    scope: "user:email",
    id_token: "id-token",
    session_state: "state",
  } satisfies AdapterAccount);

  assert.deepEqual(createInput, {
    data: {
      userId: "user-1",
      type: "oauth",
      provider: "github",
      providerAccountId: "provider-user",
    },
  });
});

test("getSessionAndUser returns active users", async () => {
  let findUniqueInput: unknown;
  const adapter = FinhanceAuthAdapter({
    authSession: {
      findUnique: async (input: unknown) => {
        findUniqueInput = input;
        return {
          sessionToken: hashStoredAuthToken("session-token", "session"),
          userId: "user-1",
          expires: new Date("2030-01-01T00:00:00.000Z"),
          user: {
            id: "user-1",
            email: "person@example.com",
            emailVerified: null,
            name: "Person",
            image: null,
            isActive: true,
          },
        };
      },
      deleteMany: async () => {
        throw new Error("deleteMany should not run for active users");
      },
    },
  } as never);

  const result = await adapter.getSessionAndUser?.("session-token");

  assert.deepEqual(findUniqueInput, {
    where: {
      sessionToken: hashStoredAuthToken("session-token", "session"),
    },
    include: {
      user: true,
    },
  });
  assert.deepEqual(result, {
    session: {
      sessionToken: "session-token",
      userId: "user-1",
      expires: new Date("2030-01-01T00:00:00.000Z"),
    },
    user: {
      id: "user-1",
      email: "person@example.com",
      emailVerified: null,
      name: "Person",
      image: null,
    },
  });
});

test("getSessionAndUser revokes sessions for inactive users", async () => {
  let deleteManyInput: unknown;
  const adapter = FinhanceAuthAdapter({
    authSession: {
      findUnique: async () => ({
        sessionToken: "session-token",
        userId: "user-1",
        expires: new Date("2030-01-01T00:00:00.000Z"),
        user: {
          id: "user-1",
          email: "person@example.com",
          emailVerified: null,
          name: "Person",
          image: null,
          isActive: false,
        },
      }),
      deleteMany: async (input: unknown) => {
        deleteManyInput = input;
        return { count: 2 };
      },
    },
  } as never);

  const result = await adapter.getSessionAndUser?.("session-token");

  assert.equal(result, null);
  assert.deepEqual(deleteManyInput, {
    where: {
      userId: "user-1",
    },
  });
});

test("createSession stores a hash while returning the raw session token", async () => {
  let createInput: unknown;
  const adapter = FinhanceAuthAdapter({
    authSession: {
      create: async (input: unknown) => {
        createInput = input;
        return {
          sessionToken: hashStoredAuthToken("plain-session-token", "session"),
          userId: "user-1",
          expires: new Date("2030-01-01T00:00:00.000Z"),
        };
      },
    },
  } as never);

  const result = await adapter.createSession?.({
    sessionToken: "plain-session-token",
    userId: "user-1",
    expires: new Date("2030-01-01T00:00:00.000Z"),
  });

  assert.deepEqual(createInput, {
    data: {
      sessionToken: hashStoredAuthToken("plain-session-token", "session"),
      userId: "user-1",
      expires: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
  assert.deepEqual(result, {
    sessionToken: "plain-session-token",
    userId: "user-1",
    expires: new Date("2030-01-01T00:00:00.000Z"),
  });
});

test("deleteSession hashes the session token before deleting", async () => {
  let deleteInput: unknown;
  const adapter = FinhanceAuthAdapter({
    authSession: {
      delete: async (input: unknown) => {
        deleteInput = input;
        return {
          sessionToken: hashStoredAuthToken("plain-session-token", "session"),
          userId: "user-1",
          expires: new Date("2030-01-01T00:00:00.000Z"),
        };
      },
    },
  } as never);

  const result = await adapter.deleteSession?.("plain-session-token");

  assert.deepEqual(deleteInput, {
    where: {
      sessionToken: hashStoredAuthToken("plain-session-token", "session"),
    },
  });
  assert.deepEqual(result, {
    sessionToken: "plain-session-token",
    userId: "user-1",
    expires: new Date("2030-01-01T00:00:00.000Z"),
  });
});

test("deleteUser deactivates the user and revokes sessions", async () => {
  let updateInput: unknown;
  let deleteManyInput: unknown;
  const adapter = FinhanceAuthAdapter({
    user: {
      update: async (input: unknown) => {
        updateInput = input;
        return {
          id: "user-1",
          email: "person@example.com",
          emailVerified: null,
          name: "Person",
          image: null,
        };
      },
    },
    authSession: {
      deleteMany: async (input: unknown) => {
        deleteManyInput = input;
        return { count: 2 };
      },
    },
  } as never);

  const result = await adapter.deleteUser?.("user-1");

  assert.deepEqual(updateInput, {
    where: {
      id: "user-1",
    },
    data: {
      isActive: false,
    },
  });
  assert.deepEqual(deleteManyInput, {
    where: {
      userId: "user-1",
    },
  });
  assert.deepEqual(result, {
    id: "user-1",
    email: "person@example.com",
    emailVerified: null,
    name: "Person",
    image: null,
  });
});

test("verification tokens are hashed at rest and returned in raw form", async () => {
  let createInput: unknown;
  let deleteInput: unknown;
  const adapter = FinhanceAuthAdapter({
    authVerificationToken: {
      create: async (input: unknown) => {
        createInput = input;
        return {
          identifier: "person@example.com",
          token: hashStoredAuthToken(
            "plain-verification-token",
            "verification",
          ),
          expires: new Date("2030-01-01T00:00:00.000Z"),
        };
      },
      delete: async (input: unknown) => {
        deleteInput = input;
        return {
          identifier: "person@example.com",
          token: hashStoredAuthToken(
            "plain-verification-token",
            "verification",
          ),
          expires: new Date("2030-01-01T00:00:00.000Z"),
        };
      },
    },
  } as never);

  const created = await adapter.createVerificationToken?.({
    identifier: "person@example.com",
    token: "plain-verification-token",
    expires: new Date("2030-01-01T00:00:00.000Z"),
  });
  const consumed = await adapter.useVerificationToken?.({
    identifier: "person@example.com",
    token: "plain-verification-token",
  });

  assert.deepEqual(createInput, {
    data: {
      identifier: "person@example.com",
      token: hashStoredAuthToken("plain-verification-token", "verification"),
      expires: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
  assert.deepEqual(deleteInput, {
    where: {
      identifier_token: {
        identifier: "person@example.com",
        token: hashStoredAuthToken("plain-verification-token", "verification"),
      },
    },
  });
  assert.deepEqual(created, {
    identifier: "person@example.com",
    token: "plain-verification-token",
    expires: new Date("2030-01-01T00:00:00.000Z"),
  });
  assert.deepEqual(consumed, {
    identifier: "person@example.com",
    token: "plain-verification-token",
    expires: new Date("2030-01-01T00:00:00.000Z"),
  });
});
