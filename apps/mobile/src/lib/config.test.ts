import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_PRODUCTION_SERVER_URL = "https://finhance-web.vercel.app";
const ORIGINAL_PRODUCTION_SERVER_URL =
  process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL;

async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

describe("PRODUCTION_SERVER_URL", () => {
  afterEach(() => {
    vi.resetModules();

    if (ORIGINAL_PRODUCTION_SERVER_URL === undefined) {
      delete process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL;
      return;
    }

    process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL =
      ORIGINAL_PRODUCTION_SERVER_URL;
  });

  it("normalises valid overrides", async () => {
    process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL =
      "https://staging.finhance.example.com/";

    const { PRODUCTION_SERVER_URL } = await loadConfig();

    expect(PRODUCTION_SERVER_URL).toBe("https://staging.finhance.example.com");
  });

  it("falls back to the default deployment for invalid overrides", async () => {
    process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL = "ftp://staging.invalid";

    const { PRODUCTION_SERVER_URL } = await loadConfig();

    expect(PRODUCTION_SERVER_URL).toBe(DEFAULT_PRODUCTION_SERVER_URL);
  });
});
