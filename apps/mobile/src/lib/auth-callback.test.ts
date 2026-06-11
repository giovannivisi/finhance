import { describe, expect, it } from "vitest";

import { classifyServer, parseMobileAuthCallback } from "./auth-callback";

describe("parseMobileAuthCallback", () => {
  it("reads the token from the fragment", () => {
    expect(parseMobileAuthCallback("finhance://auth#token=abc.def")).toBe(
      "abc.def",
    );
    expect(
      parseMobileAuthCallback(
        "exp://192.168.1.19:8081/--/auth#token=tok&other=1",
      ),
    ).toBe("tok");
  });

  it("decodes encoded tokens", () => {
    expect(parseMobileAuthCallback("finhance://auth#token=a%20b")).toBe("a b");
  });

  it("falls back to a query parameter", () => {
    expect(parseMobileAuthCallback("https://x.example/auth?token=qqq")).toBe(
      "qqq",
    );
  });

  it("returns null when no token is present", () => {
    expect(parseMobileAuthCallback("finhance://auth")).toBeNull();
    expect(parseMobileAuthCallback("finhance://auth#other=1")).toBeNull();
    expect(parseMobileAuthCallback("not a url")).toBeNull();
  });
});

describe("classifyServer", () => {
  it("recognises local and hosted APIs", () => {
    expect(classifyServer({ service: "api", authMode: "local" }, null)).toEqual(
      { kind: "local-api" },
    );
    expect(
      classifyServer({ service: "api", authMode: "hosted" }, null),
    ).toEqual({ kind: "hosted-api" });
  });

  it("recognises hosted and local web deployments", () => {
    expect(
      classifyServer(null, { service: "finhance-web", authMode: "hosted" }),
    ).toEqual({ kind: "hosted-web" });
    expect(
      classifyServer(null, { service: "finhance-web", authMode: "local" }),
    ).toEqual({ kind: "local-web" });
  });

  it("prefers the API health when both answer", () => {
    expect(
      classifyServer(
        { service: "api", authMode: "local" },
        { service: "finhance-web", authMode: "hosted" },
      ),
    ).toEqual({ kind: "local-api" });
  });

  it("returns unknown for anything else", () => {
    expect(classifyServer(null, null)).toEqual({ kind: "unknown" });
    expect(classifyServer({ service: "nginx" }, null)).toEqual({
      kind: "unknown",
    });
  });
});
