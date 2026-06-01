import { expect, test } from "@playwright/test";

test.describe("core pages", () => {
  test("loads dashboard, budgets, analytics, and recurring routes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText(/setup checklist|dashboard unavailable/i),
    ).toBeVisible();

    await page.goto("/budgets");
    await expect(
      page.getByRole("heading", { name: /budget workspace/i }),
    ).toBeVisible();

    await page.goto("/analytics");
    await expect(
      page.getByRole("heading", { name: /analytics/i }),
    ).toBeVisible();

    await page.goto("/recurring");
    await expect(
      page.getByRole("heading", { name: /recurring/i }),
    ).toBeVisible();
  });

  test("opens the mobile more panel from the tab bar", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await page.goto("/setup");
    await page.getByRole("button", { name: /more navigation/i }).click();
    await expect(page.getByLabel(/more navigation/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible();
  });
});
