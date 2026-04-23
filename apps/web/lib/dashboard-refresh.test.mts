import assert from "node:assert/strict";
import test from "node:test";
import {
  getDashboardRefreshNotice,
  requestDashboardRefresh,
} from "./dashboard-refresh.ts";

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

test("requestDashboardRefresh returns success for a successful refresh call", async () => {
  setApiUrlForTest();
  try {
    const result = await requestDashboardRefresh(
      async () => new Response(null, { status: 201 }),
    );

    assert.deepEqual(result, { ok: true });
  } finally {
    restoreApiUrl();
  }
});

test("requestDashboardRefresh returns parsed API failures", async () => {
  setApiUrlForTest();
  try {
    const result = await requestDashboardRefresh(
      async () =>
        new Response(JSON.stringify({ message: "Cooling down." }), {
          status: 429,
          headers: {
            "content-type": "application/json",
          },
        }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 429,
      error: "Cooling down.",
    });
  } finally {
    restoreApiUrl();
  }
});

test("requestDashboardRefresh returns network failures as errors", async () => {
  setApiUrlForTest();
  try {
    const result = await requestDashboardRefresh(async () => {
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

test("getDashboardRefreshNotice only calms known refresh lock and cooldown messages", () => {
  assert.equal(
    getDashboardRefreshNotice(409, "Refresh already in progress."),
    "Refresh already in progress.",
  );
  assert.equal(
    getDashboardRefreshNotice(429, "Refresh is cooling down. Try again in 5s."),
    "Refresh is cooling down. Try again in 5s.",
  );
  assert.equal(
    getDashboardRefreshNotice(429, "ThrottlerException: Too Many Requests"),
    null,
  );
  assert.equal(getDashboardRefreshNotice(null, "Network down"), null);
});
