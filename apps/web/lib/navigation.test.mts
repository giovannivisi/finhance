import assert from "node:assert/strict";
import test from "node:test";
import { isRedundantTabNavigation } from "./navigation.ts";

test("isRedundantTabNavigation blocks navigation to the current page", () => {
  assert.equal(
    isRedundantTabNavigation({
      currentPath: "/accounts",
      targetPath: "/accounts",
    }),
    true,
  );
});

test("isRedundantTabNavigation blocks duplicate clicks while a tab navigation is pending", () => {
  assert.equal(
    isRedundantTabNavigation({
      currentPath: "/",
      targetPath: "/categories",
      pendingPath: "/categories",
    }),
    true,
  );
});

test("isRedundantTabNavigation allows a different destination", () => {
  assert.equal(
    isRedundantTabNavigation({
      currentPath: "/accounts",
      targetPath: "/categories",
      pendingPath: "/transactions",
    }),
    false,
  );
});

test("isRedundantTabNavigation treats trailing slashes as equivalent", () => {
  assert.equal(
    isRedundantTabNavigation({
      currentPath: "/accounts/",
      targetPath: "/accounts",
    }),
    true,
  );
});
