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

test("requestRecurringMaterialization reuses the same in-flight request", async () => {
  setApiUrlForTest();
  try {
    let callCount = 0;
    let resolveFetch: ((response: Response) => void) | null = null;

    const fetchImpl = () => {
      callCount += 1;

      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    };

    const firstRequest = requestRecurringMaterialization(
      fetchImpl as typeof fetch,
    );
    const secondRequest = requestRecurringMaterialization(
      fetchImpl as typeof fetch,
    );

    assert.equal(callCount, 1);

    resolveFetch?.(
      new Response(
        JSON.stringify({
          createdCount: 4,
          processedRuleCount: 4,
          failedRuleCount: 0,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const [firstResult, secondResult] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    assert.deepEqual(firstResult, secondResult);
    assert.deepEqual(firstResult, {
      ok: true,
      summary: {
        createdCount: 4,
        processedRuleCount: 4,
        failedRuleCount: 0,
      },
    });
  } finally {
    restoreApiUrl();
  }
});
