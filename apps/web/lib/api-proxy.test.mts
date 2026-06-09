import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpstreamRequest,
  resolveCrossOriginRejection,
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

test("stripForwardedHeaders can remove browser context headers for hosted proxying", () => {
  const headers = stripForwardedHeaders(
    new Headers({
      origin: "https://preview.example",
      referer: "https://preview.example/settings/user",
      "content-type": "application/json",
    }),
    { stripBrowserContext: true },
  );

  assert.equal(headers.get("origin"), null);
  assert.equal(headers.get("referer"), null);
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

test("resolveCrossOriginRejection allows same-origin state-changing requests", () => {
  const request = new Request("https://finhance.test/api/proxy/transactions", {
    method: "POST",
    headers: { origin: "https://finhance.test" },
  });

  assert.equal(resolveCrossOriginRejection(request), null);
});

test("resolveCrossOriginRejection allows requests without an Origin header", () => {
  const request = new Request("https://finhance.test/api/proxy/transactions", {
    method: "POST",
  });

  assert.equal(resolveCrossOriginRejection(request), null);
});

test("resolveCrossOriginRejection ignores safe methods", () => {
  const request = new Request("https://finhance.test/api/proxy/dashboard", {
    method: "GET",
    headers: { origin: "https://attacker.example" },
  });

  assert.equal(resolveCrossOriginRejection(request), null);
});

test("resolveCrossOriginRejection rejects cross-site state-changing requests", async () => {
  const request = new Request("https://finhance.test/api/proxy/transactions", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });

  const rejection = resolveCrossOriginRejection(request);

  assert.ok(rejection);
  assert.equal(rejection.status, 403);
  assert.deepEqual(await rejection.json(), {
    message: "Cross-origin requests are not allowed.",
  });
});

test("resolveCrossOriginRejection rejects opaque 'null' origins", () => {
  const request = new Request("https://finhance.test/api/proxy/transactions", {
    method: "DELETE",
    headers: { origin: "null" },
  });

  assert.equal(resolveCrossOriginRejection(request)?.status, 403);
});

test("resolveCrossOriginRejection accepts the forwarded host origin behind a proxy", () => {
  const request = new Request("http://127.0.0.1:3001/api/proxy/transactions", {
    method: "POST",
    headers: {
      origin: "https://app.finhance.example",
      "x-forwarded-host": "app.finhance.example",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(resolveCrossOriginRejection(request), null);
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
