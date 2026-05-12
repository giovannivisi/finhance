import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpstreamRequest,
  stripForwardedHeaders,
  toUpstreamResponse,
} from "./api-proxy.ts";

test("stripForwardedHeaders removes hop-by-hop and credential headers", () => {
  const headers = stripForwardedHeaders(
    new Headers({
      authorization: "Bearer token",
      cookie: "session=value",
      host: "localhost:3001",
      "x-forwarded-for": "127.0.0.1",
      "content-type": "application/json",
    }),
  );

  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("host"), null);
  assert.equal(headers.get("x-forwarded-for"), null);
  assert.equal(headers.get("content-type"), "application/json");
});

test("buildUpstreamRequest preserves streaming request bodies", async () => {
  const request = new Request("https://finhance.test/api/proxy/imports", {
    method: "POST",
    body: "streamed-body",
    headers: {
      "content-type": "text/plain",
    },
  });

  const upstreamRequest = await buildUpstreamRequest(request);

  assert.equal(upstreamRequest.body, request.body);
  assert.equal(upstreamRequest.duplex, "half");
  assert.equal(
    await new Response(upstreamRequest.body).text(),
    "streamed-body",
  );
});

test("buildUpstreamRequest omits bodies for GET requests", async () => {
  const request = new Request("https://finhance.test/api/proxy/dashboard", {
    method: "GET",
  });

  const upstreamRequest = await buildUpstreamRequest(request);

  assert.deepEqual(upstreamRequest, {
    body: undefined,
  });
});

test("toUpstreamResponse preserves the upstream stream while stripping unsafe headers", async () => {
  const upstreamResponse = new Response("zip-bytes", {
    status: 200,
    headers: {
      "cache-control": "public, max-age=3600",
      "content-encoding": "gzip",
      etag: "strong-etag",
      "set-cookie": "session=value",
      "transfer-encoding": "chunked",
    },
  });

  const proxiedResponse = await toUpstreamResponse(upstreamResponse);

  assert.equal(await proxiedResponse.text(), "zip-bytes");
  assert.equal(
    proxiedResponse.headers.get("cache-control"),
    "no-store, no-transform",
  );
  assert.equal(proxiedResponse.headers.get("content-encoding"), "identity");
  assert.equal(proxiedResponse.headers.get("etag"), null);
  assert.equal(proxiedResponse.headers.get("set-cookie"), null);
  assert.equal(proxiedResponse.headers.get("transfer-encoding"), null);
});
