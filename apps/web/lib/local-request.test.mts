import assert from "node:assert/strict";
import test from "node:test";
import {
  isLoopbackRequest,
  LOCAL_MODE_LOOPBACK_ONLY_MESSAGE,
  LOCAL_MODE_PRODUCTION_MESSAGE,
  resolveLocalRequestRejection,
} from "./local-request.ts";

function createRequest(input: {
  url: string;
  headers?: Record<string, string>;
}) {
  return {
    url: input.url,
    headers: new Headers(input.headers),
  };
}

test("isLoopbackRequest accepts loopback hosts without forwarded IP headers", () => {
  assert.equal(
    isLoopbackRequest(
      createRequest({
        url: "http://127.0.0.1:3001/dashboard",
        headers: {
          host: "127.0.0.1:3001",
        },
      }),
    ),
    true,
  );
});

test("isLoopbackRequest rejects public hosts", () => {
  assert.equal(
    isLoopbackRequest(
      createRequest({
        url: "https://finhance.example/dashboard",
        headers: {
          host: "finhance.example",
        },
      }),
    ),
    false,
  );
});

test("isLoopbackRequest rejects non-loopback forwarded IPs", () => {
  assert.equal(
    isLoopbackRequest(
      createRequest({
        url: "http://localhost:3001/dashboard",
        headers: {
          host: "localhost:3001",
          "x-forwarded-for": "203.0.113.24",
        },
      }),
    ),
    false,
  );
});

test("resolveLocalRequestRejection blocks local mode in production", () => {
  assert.deepEqual(
    resolveLocalRequestRejection(
      createRequest({
        url: "http://localhost:3001/dashboard",
        headers: {
          host: "localhost:3001",
        },
      }),
      {
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv,
    ),
    {
      status: 503,
      message: LOCAL_MODE_PRODUCTION_MESSAGE,
    },
  );
});

test("resolveLocalRequestRejection blocks non-loopback local requests in development", () => {
  assert.deepEqual(
    resolveLocalRequestRejection(
      createRequest({
        url: "http://192.168.0.10:3001/dashboard",
        headers: {
          host: "192.168.0.10:3001",
        },
      }),
      {
        NODE_ENV: "development",
        AUTH_MODE: "local",
      } as NodeJS.ProcessEnv,
    ),
    {
      status: 403,
      message: LOCAL_MODE_LOOPBACK_ONLY_MESSAGE,
    },
  );
});

test("resolveLocalRequestRejection allows hosted mode", () => {
  assert.equal(
    resolveLocalRequestRejection(
      createRequest({
        url: "https://finhance.example/dashboard",
        headers: {
          host: "finhance.example",
        },
      }),
      {
        NODE_ENV: "production",
        AUTH_MODE: "hosted",
      } as NodeJS.ProcessEnv,
    ),
    null,
  );
});
