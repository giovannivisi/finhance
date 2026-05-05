import assert from "node:assert/strict";
import test from "node:test";
import type { AdapterAccount } from "next-auth/adapters";
import { FinhanceAuthAdapter } from "./auth-adapter-core.ts";

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
          isActive: true,
        },
      }),
      deleteMany: async () => {
        throw new Error("deleteMany should not run for active users");
      },
    },
  } as never);

  const result = await adapter.getSessionAndUser?.("session-token");

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
