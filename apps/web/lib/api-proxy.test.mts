import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpstreamRequest,
  stripForwardedHeaders,
  toUpstreamResponse,
} from "./api-proxy.ts";

test("stripForwardedHeaders removes hop-by-hop and browser-only auth headers", () => {
  const headers = stripForwardedHeaders(
    new Headers({
      "accept-encoding": "gzip, br",
      authorization: "Bearer secret",
      connection: "keep-alive",
      "content-length": "123",
      cookie: "session=abc",
      host: "finhance.test",
      "x-forwarded-for": "127.0.0.1",
      "x-forwarded-host": "finhance.test",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
    }),
  );

  assert.equal(headers.get("accept-encoding"), null);
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("connection"), null);
  assert.equal(headers.get("content-length"), null);
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("host"), null);
  assert.equal(headers.get("x-forwarded-for"), null);
  assert.equal(headers.get("x-forwarded-host"), null);
  assert.equal(headers.get("x-forwarded-port"), null);
  assert.equal(headers.get("x-forwarded-proto"), null);
  assert.equal(headers.get("content-type"), "application/json");
});

test("toUpstreamResponse strips stale encoding headers from decoded upstream bodies", async () => {
  const upstream = new Response('{"ok":true}', {
    status: 201,
    headers: {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-type": "application/json",
      "content-encoding": "gzip",
      "content-length": "42",
      etag: 'W/"42-test"',
      "set-cookie": "session=abc",
      "transfer-encoding": "chunked",
    },
  });

  const proxied = await toUpstreamResponse(upstream);

  assert.equal(proxied.status, 201);
  assert.equal(proxied.headers.get("cache-control"), "no-store, no-transform");
  assert.equal(proxied.headers.get("content-type"), "application/json");
  assert.equal(proxied.headers.get("content-encoding"), "identity");
  assert.equal(proxied.headers.get("content-length"), null);
  assert.equal(proxied.headers.get("etag"), null);
  assert.equal(proxied.headers.get("set-cookie"), null);
  assert.equal(proxied.headers.get("transfer-encoding"), null);
  assert.equal(proxied.headers.get("x-finhance-proxy"), "buffered-identity-v2");
  assert.equal(await proxied.text(), '{"ok":true}');
});

test("toUpstreamResponse strips transport metadata for unencoded bodies", async () => {
  const upstream = new Response("plain text", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-length": "10",
    },
  });

  const proxied = await toUpstreamResponse(upstream);

  assert.equal(proxied.headers.get("cache-control"), "no-store, no-transform");
  assert.equal(proxied.headers.get("content-encoding"), "identity");
  assert.equal(proxied.headers.get("content-length"), null);
  assert.equal(await proxied.text(), "plain text");
});

test("buildUpstreamRequest rebuilds multipart uploads with fresh form-data headers", async () => {
  const formData = new FormData();
  formData.append(
    "accounts",
    new File(["name,type\nChecking,BANK\n"], "accounts.csv", {
      type: "text/csv",
    }),
  );

  const request = new Request("https://finhance.test/api/proxy/imports", {
    method: "POST",
    body: formData,
  });
  const headers = stripForwardedHeaders(request.headers);
  const prepared = await buildUpstreamRequest(request, headers);

  assert.equal(prepared.duplex, undefined);
  assert.equal(headers.get("content-type"), null);
  assert.equal(headers.get("content-length"), null);
  assert.equal(prepared.body instanceof FormData, true);

  if (!(prepared.body instanceof FormData)) {
    throw new Error("Expected multipart proxy body to be FormData");
  }

  const file = prepared.body.get("accounts");
  assert.equal(file instanceof File, true);

  if (!(file instanceof File)) {
    throw new Error("Expected multipart proxy entry to be a File");
  }

  assert.equal(file.name, "accounts.csv");
  assert.equal(await file.text(), "name,type\nChecking,BANK\n");
});

test("buildUpstreamRequest keeps non-multipart bodies as streams", async () => {
  const request = new Request("https://finhance.test/api/proxy/accounts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Checking" }),
  });
  const headers = stripForwardedHeaders(request.headers);
  const prepared = await buildUpstreamRequest(request, headers);

  assert.equal(prepared.duplex, "half");
  assert.equal(headers.get("content-type"), "application/json");
  assert.notEqual(prepared.body, undefined);

  const replayed = new Request("https://finhance.test/upstream", {
    method: "POST",
    headers,
    body: prepared.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  assert.equal(await replayed.text(), '{"name":"Checking"}');
});
