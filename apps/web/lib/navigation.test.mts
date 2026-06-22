import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicAuthPath,
  isRedundantTabNavigation,
  SECONDARY_NAV_ITEMS,
} from "./navigation.ts";

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

test("secondary navigation exposes monthly close by label", () => {
  assert.equal(
    SECONDARY_NAV_ITEMS.find((item) => item.href === "/review")?.label,
    "Monthly close",
  );
});

test("isPublicAuthPath recognises the unauthenticated hosted pages", () => {
  assert.equal(isPublicAuthPath("/"), true);
  assert.equal(isPublicAuthPath("/login/"), true);
  assert.equal(isPublicAuthPath("/signup"), true);
  assert.equal(isPublicAuthPath("/dashboard"), false);
});
