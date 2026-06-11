import assert from "node:assert/strict";
import test from "node:test";
import {
  clearServerApiCacheForUser,
  getServerApiCacheUserKey,
  isCacheableServerApiRequest,
  readThroughServerApiCache,
  resetServerApiCacheForTests,
  resolveServerApiCacheTtl,
} from "./server-api-cache.ts";

test("server API cache keys hosted data by user", () => {
  assert.equal(
    getServerApiCacheUserKey({ hostedAuthMode: true, userId: " user-1 " }),
    "user:user-1",
  );
  assert.equal(
    getServerApiCacheUserKey({ hostedAuthMode: true, userId: " " }),
    null,
  );
  assert.equal(
    getServerApiCacheUserKey({ hostedAuthMode: false, userId: null }),
    "local",
  );
});

test("server API cache only accepts plain GET requests", () => {
  assert.equal(isCacheableServerApiRequest(), true);
  assert.equal(isCacheableServerApiRequest({ method: "GET" }), true);
  assert.equal(isCacheableServerApiRequest({ method: "POST" }), false);
  assert.equal(
    isCacheableServerApiRequest({ headers: { "x-test": "1" } }),
    false,
  );
});

test("server API cache deduplicates reads per user and path", async () => {
  resetServerApiCacheForTests();
  let calls = 0;

  const load = async () => {
    calls += 1;
    return { calls };
  };

  const first = await readThroughServerApiCache({
    userKey: "user:user-1",
    path: "/dashboard",
    load,
  });
  const second = await readThroughServerApiCache({
    userKey: "user:user-1",
    path: "/dashboard",
    load,
  });
  const otherUser = await readThroughServerApiCache({
    userKey: "user:user-2",
    path: "/dashboard",
    load,
  });

  assert.deepEqual(first, { calls: 1 });
  assert.strictEqual(second, first);
  assert.deepEqual(otherUser, { calls: 2 });
});

test("server API cache clears entries for one user", async () => {
  resetServerApiCacheForTests();
  let calls = 0;

  const load = async () => {
    calls += 1;
    return calls;
  };

  await readThroughServerApiCache({
    userKey: "user:user-1",
    path: "/accounts",
    load,
  });
  await readThroughServerApiCache({
    userKey: "user:user-2",
    path: "/accounts",
    load,
  });

  clearServerApiCacheForUser("user:user-1");

  assert.equal(
    await readThroughServerApiCache({
      userKey: "user:user-1",
      path: "/accounts",
      load,
    }),
    3,
  );
  assert.equal(
    await readThroughServerApiCache({
      userKey: "user:user-2",
      path: "/accounts",
      load,
    }),
    2,
  );
});

test("server API cache uses longer ttl for reference data", () => {
  assert.ok(
    resolveServerApiCacheTtl("/categories?includeArchived=true") >
      resolveServerApiCacheTtl("/dashboard"),
  );
});
