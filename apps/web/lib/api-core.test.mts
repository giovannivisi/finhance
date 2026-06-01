import assert from "node:assert/strict";
import test from "node:test";
import { readApiResponseBody } from "./api-core.ts";

test("readApiResponseBody returns undefined for 204 responses", async () => {
  const response = new Response(null, {
    status: 204,
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(await readApiResponseBody<void>(response), undefined);
});

test("readApiResponseBody returns undefined for empty successful bodies", async () => {
  const response = new Response("", {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(await readApiResponseBody<void>(response), undefined);
});

test("readApiResponseBody parses JSON success payloads", async () => {
  const response = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

  assert.deepEqual(
    await readApiResponseBody<{ ok: boolean }>(response),
    { ok: true },
  );
});
