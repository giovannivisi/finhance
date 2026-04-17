import assert from "node:assert/strict";
import test from "node:test";
import { readApiError } from "./api.ts";

test("readApiError returns JSON message strings", async () => {
  const response = new Response(JSON.stringify({ message: "Invalid asset." }), {
    status: 400,
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(await readApiError(response), "Invalid asset.");
});

test("readApiError returns short plain-text errors", async () => {
  const response = new Response("Upstream timeout", {
    status: 504,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });

  assert.equal(await readApiError(response), "Upstream timeout");
});

test("readApiError sanitizes HTML error pages", async () => {
  const response = new Response(
    "<!DOCTYPE html><html><head><title>404</title></head><body>Not found</body></html>",
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );

  const error = await readApiError(response);

  assert.match(error, /API error: 404/);
  assert.match(error, /NEXT_PUBLIC_API_URL/);
  assert.doesNotMatch(error, /<!DOCTYPE html>/i);
});
