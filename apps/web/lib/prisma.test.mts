import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@finhance/db";
import { isRetryableConnectionError } from "./prisma-retry.ts";

test("treats database reachability initialization errors as retryable", () => {
  const error = new Prisma.PrismaClientInitializationError(
    "Can't reach database server at preview-db.example.com:5432",
    "6.19.0",
  );

  assert.equal(isRetryableConnectionError(error), true);
});

test("treats connection-pool timeout errors as retryable", () => {
  const error = new Prisma.PrismaClientKnownRequestError(
    "pool timeout",
    {
      code: "P2024",
      clientVersion: "6.19.0",
    },
  );

  assert.equal(isRetryableConnectionError(error), true);
});

test("does not mark unrelated prisma errors as retryable", () => {
  const error = new Prisma.PrismaClientKnownRequestError(
    "record missing",
    {
      code: "P2025",
      clientVersion: "6.19.0",
    },
  );

  assert.equal(isRetryableConnectionError(error), false);
});
