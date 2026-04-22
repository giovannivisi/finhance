import assert from "node:assert/strict";
import test from "node:test";
import { requestRecurringMaterialization } from "./recurring-materialization.ts";

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

test("requestRecurringMaterialization returns the sync summary on success", async () => {
  setApiUrlForTest();
  try {
    const result = await requestRecurringMaterialization(
      async () =>
        new Response(
          JSON.stringify({
            createdCount: 2,
            processedRuleCount: 3,
            failedRuleCount: 1,
          }),
          {
            status: 201,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    );

    assert.deepEqual(result, {
      ok: true,
      summary: {
        createdCount: 2,
        processedRuleCount: 3,
        failedRuleCount: 1,
      },
    });
  } finally {
    restoreApiUrl();
  }
});

test("requestRecurringMaterialization returns parsed API failures", async () => {
  setApiUrlForTest();
  try {
    const result = await requestRecurringMaterialization(
      async () =>
        new Response(JSON.stringify({ message: "Try again later." }), {
          status: 429,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 429,
      error: "Try again later.",
    });
  } finally {
    restoreApiUrl();
  }
});

test("requestRecurringMaterialization returns network failures as errors", async () => {
  setApiUrlForTest();
  try {
    const result = await requestRecurringMaterialization(async () => {
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
