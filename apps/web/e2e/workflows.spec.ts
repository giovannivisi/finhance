import { expect, test } from "@playwright/test";

const API_URL = "http://127.0.0.1:3100";

function createHeaders() {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  };
}

async function expectOk(
  response: {
    ok(): boolean;
    status(): number;
    text(): Promise<string>;
  },
  label: string,
) {
  if (response.ok()) {
    return;
  }

  throw new Error(
    `${label} failed with ${response.status()}: ${await response.text()}`,
  );
}

test.describe("real seeded workflows", () => {
  test("creates a budget from the budgets workspace", async ({
    page,
    request,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    const suffix = `budget-${Date.now()}`;

    const accountResponse = await request.post(`${API_URL}/accounts`, {
      headers: createHeaders(),
      data: {
        name: `Checking ${suffix}`,
        type: "BANK",
        currency: "EUR",
      },
    });
    expect(accountResponse.ok()).toBeTruthy();
    const account = (await accountResponse.json()) as { id: string };

    const primaryResponse = await request.post(`${API_URL}/categories`, {
      headers: createHeaders(),
      data: {
        name: `Food ${suffix}`,
        type: "EXPENSE",
        parentCategoryId: null,
      },
    });
    expect(primaryResponse.ok()).toBeTruthy();
    const primary = (await primaryResponse.json()) as { id: string };

    const secondaryResponse = await request.post(`${API_URL}/categories`, {
      headers: createHeaders(),
      data: {
        name: `Groceries ${suffix}`,
        type: "EXPENSE",
        parentCategoryId: primary.id,
      },
    });
    expect(secondaryResponse.ok()).toBeTruthy();
    const secondary = (await secondaryResponse.json()) as { id: string };

    const cashAssetResponse = await request.post(`${API_URL}/assets`, {
      headers: createHeaders(),
      data: {
        name: `Cash ${suffix}`,
        type: "ASSET",
        accountId: account.id,
        currency: "EUR",
        balance: 500,
        kind: "CASH",
      },
    });
    await expectOk(cashAssetResponse, "Seed budgets cash asset");

    const transactionResponse = await request.post(`${API_URL}/transactions`, {
      headers: createHeaders(),
      data: {
        postedAt: "2026-05-20T10:30:00.000Z",
        kind: "EXPENSE",
        amount: 48,
        description: `Groceries ${suffix}`,
        accountId: account.id,
        direction: "OUTFLOW",
        categoryId: secondary.id,
      },
    });
    await expectOk(transactionResponse, "Seed expense transaction");

    await page.goto("/budgets");
    await expect(page.getByRole("heading", { name: /budgets/i })).toBeVisible();
    await page.getByText("Budget coverage is incomplete").click();
    const uncoveredCategoryEntry = page
      .locator(".budget-coverage-entry")
      .filter({
        has: page.locator(".budget-coverage-entry-name", {
          hasText: `Groceries ${suffix}`,
        }),
      })
      .first();
    await uncoveredCategoryEntry
      .getByRole("button", { name: "Create budget" })
      .click();

    const dialog = page.getByRole("dialog", { name: /create budget/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Monthly budget").fill("60");
    await dialog.getByRole("button", { name: "Create budget" }).click();

    const createdBudgetCard = page.locator("article.list-card").filter({
      has: page.getByRole("heading", {
        name: `Groceries ${suffix}`,
      }),
    });
    await expect(createdBudgetCard).toBeVisible();
    await expect(createdBudgetCard).toContainText(/spent against.*60,00/i);
  });

  test("records a dividend from the brokerage workspace", async ({
    page,
    request,
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    const suffix = `brokerage-${Date.now()}`;

    const brokerResponse = await request.post(`${API_URL}/accounts`, {
      headers: createHeaders(),
      data: {
        name: `Broker ${suffix}`,
        type: "BROKER",
        currency: "EUR",
      },
    });
    expect(brokerResponse.ok()).toBeTruthy();
    const broker = (await brokerResponse.json()) as { id: string };

    const incomeCategoryResponse = await request.post(`${API_URL}/categories`, {
      headers: createHeaders(),
      data: {
        name: `Investing income ${suffix}`,
        type: "INCOME",
        parentCategoryId: null,
      },
    });
    expect(incomeCategoryResponse.ok()).toBeTruthy();
    const incomeCategory = (await incomeCategoryResponse.json()) as {
      id: string;
    };

    const cashAssetResponse = await request.post(`${API_URL}/assets`, {
      headers: createHeaders(),
      data: {
        name: `Broker cash ${suffix}`,
        type: "ASSET",
        accountId: broker.id,
        currency: "EUR",
        balance: 1000,
        kind: "CASH",
      },
    });
    await expectOk(cashAssetResponse, "Seed brokerage cash asset");

    const stockAssetResponse = await request.post(`${API_URL}/assets`, {
      headers: createHeaders(),
      data: {
        name: `VWCE ${suffix}`,
        type: "ASSET",
        accountId: broker.id,
        currency: "EUR",
        quantity: 5,
        unitPrice: 100,
        balance: 500,
        kind: "STOCK",
        ticker: `VW${suffix.slice(-4).toUpperCase()}`,
        exchange: ".MI",
      },
    });
    expect(stockAssetResponse.ok()).toBeTruthy();
    const stockAsset = (await stockAssetResponse.json()) as { id: string };

    await page.goto(`/brokerage/${broker.id}`);
    await expect(page.getByRole("button", { name: /operations/i })).toBeVisible(
      { timeout: 15_000 },
    );

    await page.getByRole("button", { name: /operations/i }).click();
    await page.getByRole("menuitem", { name: "Dividend" }).click();

    const dialog = page.getByRole("dialog", { name: /record dividend/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Holding").selectOption(stockAsset.id);
    await dialog.getByLabel("Amount").fill("12.50");
    await dialog.getByLabel("Category").selectOption(incomeCategory.id);
    await dialog.getByRole("button", { name: "Record dividend" }).click();

    await page.getByText(/Activity.*1 entries/i).click();

    const activityCard = page
      .locator(".brokerage-activity-card")
      .filter({
        has: page.locator(".brokerage-activity-title", { hasText: "Dividend" }),
      })
      .first();
    await expect(activityCard).toBeVisible();
    await expect(activityCard).toContainText(/12,50/);
  });
});
