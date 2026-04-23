import assert from "node:assert/strict";
import test from "node:test";
import { requestSnapshotCapture } from "./snapshot-capture.ts";

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

function setApiUrlForTest() {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
}

function restoreApiUrl() {
  if (ORIGINAL_API_URL === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
    return;
  }

  process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
}

test("requestSnapshotCapture returns success for a successful capture", async () => {
  setApiUrlForTest();
  try {
    const result = await requestSnapshotCapture(
      async () => new Response(null, { status: 201 }),
    );

    assert.deepEqual(result, { ok: true });
  } finally {
    restoreApiUrl();
  }
});

test("requestSnapshotCapture returns parsed API failures", async () => {
  setApiUrlForTest();
  try {
    const result = await requestSnapshotCapture(
      async () =>
        new Response(JSON.stringify({ message: "Already capturing." }), {
          status: 409,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 409,
      error: "Already capturing.",
    });
  } finally {
    restoreApiUrl();
  }
});

test("requestSnapshotCapture returns network failures as errors", async () => {
  setApiUrlForTest();
  try {
    const result = await requestSnapshotCapture(async () => {
      throw new Error("Network down");
    });

    assert.deepEqual(result, {
      ok: false,
      status: null,
      error: "Network down",
    });
  } finally {
    restoreApiUrl();
  }
});
