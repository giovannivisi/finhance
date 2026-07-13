import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AccountResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  TransactionResponse,
} from "@finhance/shared";
import TransactionForm from "@components/TransactionForm";
import {
  createEmptyTransactionFormValues,
  type TransactionFormValues,
} from "@lib/transaction-form";
import { apiMutation } from "@lib/api";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
}));

const mockedApiMutation = vi.mocked(apiMutation);

const accounts: AccountResponse[] = [
  {
    id: "account-bank",
    name: "Main account",
    type: "BANK",
    currency: "EUR",
    institution: null,
    notes: null,
    order: 0,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "account-savings",
    name: "Savings",
    type: "BANK",
    currency: "EUR",
    institution: null,
    notes: null,
    order: 1,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "account-usd",
    name: "USD wallet",
    type: "BANK",
    currency: "USD",
    institution: null,
    notes: null,
    order: 2,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "account-cash",
    name: "Cash wallet",
    type: "CASH",
    currency: "EUR",
    institution: null,
    notes: null,
    order: 3,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
];

const categories: CategoryResponse[] = [
  {
    id: "category-food",
    name: "Food",
    type: "EXPENSE",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 0,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "category-cafes",
    name: "Cafes",
    type: "EXPENSE",
    parentCategoryId: "category-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
    order: 0,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "category-salary",
    name: "Salary",
    type: "INCOME",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 1,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
];

const rules: ExpenseValidationRuleResponse[] = [
  {
    id: "rule-coffee",
    entry: "Coffee",
    normalizedEntry: "coffee",
    primaryCategoryId: "category-food",
    primaryCategoryName: "Food",
    secondaryCategoryId: "category-cafes",
    secondaryCategoryName: "Cafes",
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
];

function buildCreateValues(): TransactionFormValues {
  return {
    ...createEmptyTransactionFormValues(),
    postedAt: "2026-05-20T10:30",
    amount: "15",
    description: "",
    accountId: "account-bank",
  };
}

function renderForm(
  overrides: Partial<ComponentProps<typeof TransactionForm>> = {},
) {
  return render(
    <TransactionForm
      mode="create"
      initialValues={buildCreateValues()}
      accounts={accounts}
      categories={categories}
      expenseValidationRules={rules}
      {...overrides}
    />,
  );
}

describe("TransactionForm", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    mockedApiMutation.mockReset();
    vi.useRealTimers();
  });

  it("auto-categorises expense descriptions until the user overrides the category", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Description"), "Coffee");

    expect(screen.getByLabelText("Primary")).toHaveValue("category-food");
    expect(screen.getByLabelText("Secondary")).toHaveValue("category-cafes");

    await user.selectOptions(
      screen.getByLabelText("Secondary"),
      "category-cafes",
    );
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "Unknown vendor");

    expect(screen.getByLabelText("Secondary")).toHaveValue("category-cafes");
  });

  it("applies a Quick add draft without saving the transaction", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValueOnce({
      amount: 4.5,
      currency: "EUR",
      postedAt: "2026-05-19",
      description: "Coffee",
      counterparty: "Cafe Roma",
      paymentMethod: "cash",
      cardLast4: null,
      parsedBy: "heuristic",
    });
    renderForm();

    await user.type(
      screen.getByLabelText("Transaction details"),
      "4.50 coffee yesterday cash",
    );
    await user.click(screen.getByRole("button", { name: /prepare draft/i }));

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/ai/transaction-draft", {
        method: "POST",
        body: JSON.stringify({
          text: "4.50 coffee yesterday cash",
          source: "freeform",
        }),
      });
    });
    expect(screen.getByLabelText("Amount")).toHaveValue(4.5);
    expect(screen.getByLabelText("Description")).toHaveValue("Coffee");
    expect(screen.getByLabelText(/counterparty/i)).toHaveValue("Cafe Roma");
    expect(screen.getByLabelText("Account")).toHaveValue("account-cash");
    expect(screen.getByLabelText("Primary")).toHaveValue("category-food");
    expect(screen.getByLabelText("Secondary")).toHaveValue("category-cafes");
    expect(screen.getByLabelText("Posted at")).toHaveValue("2026-05-19T10:30");
    expect(
      screen.getByText(/basic private parsing applied this draft/i),
    ).toBeInTheDocument();
    expect(mockedApiMutation).toHaveBeenCalledTimes(1);
  });

  it("switches into transfer mode and submits the transfer payload", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    renderForm();

    await user.selectOptions(screen.getByLabelText("Kind"), "TRANSFER");

    expect(
      screen.getByText(/transfers create one outflow row/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Source account")).toBeInTheDocument();
    expect(screen.getByLabelText("Destination account")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("Source account"),
      "account-bank",
    );
    await user.selectOptions(
      screen.getByLabelText("Destination account"),
      "account-savings",
    );
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "Move to savings");
    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/transactions", {
        method: "POST",
        body: JSON.stringify({
          postedAt: new Date("2026-05-20T10:30").toISOString(),
          kind: "TRANSFER",
          amount: 15,
          description: "Move to savings",
          notes: null,
          sourceAccountId: "account-bank",
          destinationAccountId: "account-savings",
          sourceAmount: 15,
          sourceCurrency: null,
          destinationCurrency: null,
        }),
      });
    });
  });

  it("submits split-funded expense payloads as one logical expense", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    renderForm({
      initialValues: {
        ...buildCreateValues(),
        description: "Lunch",
        categoryId: "category-cafes",
      },
    });

    await user.selectOptions(screen.getByLabelText("Funding"), "SPLIT");
    await user.selectOptions(
      screen.getByLabelText("Account 1"),
      "account-bank",
    );
    const legAmountInputs = screen.getAllByLabelText("Leg amount");
    await user.clear(legAmountInputs[0]!);
    await user.type(legAmountInputs[0]!, "7");
    await user.selectOptions(
      screen.getByLabelText("Account 2"),
      "account-savings",
    );
    await user.clear(legAmountInputs[1]!);
    await user.type(legAmountInputs[1]!, "8");
    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/transactions", {
        method: "POST",
        body: JSON.stringify({
          postedAt: new Date("2026-05-20T10:30").toISOString(),
          kind: "EXPENSE",
          amount: 15,
          description: "Lunch",
          notes: null,
          categoryId: "category-cafes",
          counterparty: null,
          fundingLegs: [
            { accountId: "account-bank", amount: 7 },
            { accountId: "account-savings", amount: 8 },
          ],
        }),
      });
    });
  });

  it("submits dual-currency standard transactions with a manual FX override", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    renderForm({
      initialValues: {
        ...buildCreateValues(),
        kind: "EXPENSE",
        description: "Lunch",
        categoryId: "category-cafes",
      },
    });

    await user.clear(screen.getByLabelText("Original amount"));
    await user.type(screen.getByLabelText("Original amount"), "20");
    await user.click(screen.getByLabelText("Original currency"));
    await user.click(screen.getByRole("option", { name: /US dollar/i }));
    await user.type(screen.getByLabelText("FX rate override"), "0.75");
    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/transactions", {
        method: "POST",
        body: JSON.stringify({
          postedAt: new Date("2026-05-20T10:30").toISOString(),
          kind: "EXPENSE",
          amount: 15,
          description: "Lunch",
          notes: null,
          accountId: "account-bank",
          direction: "OUTFLOW",
          categoryId: "category-cafes",
          counterparty: null,
          nativeAmount: 20,
          nativeCurrency: "USD",
          fxRateUsed: 0.75,
        }),
      });
    });
  });

  it("submits edits for an existing split-funded expense", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    renderForm({
      mode: "edit",
      transactionId: "split-1",
      initialValues: {
        postedAt: "2026-05-20T10:30",
        kind: "EXPENSE",
        amount: "15",
        description: "Lunch",
        notes: "",
        accountId: "",
        direction: "OUTFLOW",
        categoryId: "category-cafes",
        counterparty: "Cafe",
        sourceAccountId: "",
        destinationAccountId: "",
        fundingMode: "SPLIT",
        fundingLegs: [
          { accountId: "account-bank", amount: "7" },
          { accountId: "account-savings", amount: "8" },
        ],
      },
    });

    const legAmountInputs = screen.getAllByLabelText("Leg amount");
    await user.clear(legAmountInputs[0]!);
    await user.type(legAmountInputs[0]!, "6");
    await user.clear(legAmountInputs[1]!);
    await user.type(legAmountInputs[1]!, "9");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/transactions/split-1", {
        method: "PUT",
        body: JSON.stringify({
          postedAt: new Date("2026-05-20T10:30").toISOString(),
          kind: "EXPENSE",
          amount: 15,
          description: "Lunch",
          notes: null,
          categoryId: "category-cafes",
          counterparty: "Cafe",
          fundingLegs: [
            { accountId: "account-bank", amount: 6 },
            { accountId: "account-savings", amount: 9 },
          ],
        }),
      });
    });
  });

  it("submits cross-currency transfers with explicit destination amount and FX override", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    renderForm();

    await user.selectOptions(screen.getByLabelText("Kind"), "TRANSFER");
    await user.selectOptions(
      screen.getByLabelText("Source account"),
      "account-bank",
    );
    await user.selectOptions(
      screen.getByLabelText("Destination account"),
      "account-usd",
    );
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "FX transfer");
    await user.clear(screen.getByLabelText("Source amount"));
    await user.type(screen.getByLabelText("Source amount"), "25");
    await user.type(screen.getByLabelText("Destination amount"), "27.5");
    await user.type(screen.getByLabelText("FX rate override"), "1.1");
    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/transactions", {
        method: "POST",
        body: JSON.stringify({
          postedAt: new Date("2026-05-20T10:30").toISOString(),
          kind: "TRANSFER",
          amount: 15,
          description: "FX transfer",
          notes: null,
          sourceAccountId: "account-bank",
          destinationAccountId: "account-usd",
          sourceAmount: 25,
          destinationAmount: 27.5,
          sourceCurrency: null,
          destinationCurrency: null,
          fxRateUsed: 1.1,
        }),
      });
    });
  });

  it("shows a validation error when split funding reuses the same account", async () => {
    const user = userEvent.setup();

    renderForm({
      initialValues: {
        ...buildCreateValues(),
        description: "Lunch",
        categoryId: "category-cafes",
      },
    });

    await user.selectOptions(screen.getByLabelText("Funding"), "SPLIT");
    await user.selectOptions(
      screen.getByLabelText("Account 1"),
      "account-bank",
    );
    await user.selectOptions(
      screen.getByLabelText("Account 2"),
      "account-bank",
    );
    const legAmountInputs = screen.getAllByLabelText("Leg amount");
    await user.clear(legAmountInputs[0]!);
    await user.type(legAmountInputs[0]!, "7");
    await user.clear(legAmountInputs[1]!);
    await user.type(legAmountInputs[1]!, "8");
    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Split funding cannot reuse the same account twice.",
    );
    expect(mockedApiMutation).not.toHaveBeenCalled();
  });

  it("routes cash-account submit errors to the account field only", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockRejectedValueOnce(
      new Error("Insufficient cash balance for this account."),
    );

    renderForm({
      initialValues: {
        ...buildCreateValues(),
        description: "Coffee",
        categoryId: "category-cafes",
      },
    });

    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    expect(
      await screen.findByText("Insufficient cash balance for this account."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps generic submit errors in the global error area", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockRejectedValueOnce(new Error("Server exploded."));

    renderForm({
      initialValues: {
        ...buildCreateValues(),
        description: "Coffee",
        categoryId: "category-cafes",
      },
    });

    await user.click(
      screen.getByRole("button", { name: /create transaction/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server exploded.",
    );
  });

  it("shows the transfer-identity note while editing a transfer", () => {
    const editingTransaction: TransactionResponse = {
      id: "transaction-1",
      postedAt: "2026-05-20T10:30:00.000Z",
      amount: 15,
      currency: "EUR",
      kind: "TRANSFER",
      description: "Move to savings",
      notes: null,
      accountId: null,
      categoryId: null,
      direction: null,
      counterparty: null,
      sourceAccountId: "account-bank",
      destinationAccountId: "account-savings",
      primaryCategoryId: null,
      primaryCategoryName: null,
      secondaryCategoryId: null,
      secondaryCategoryName: null,
      recurringRuleId: null,
      recurringOccurrenceMonth: null,
      isRecurringGenerated: false,
      createdAt: "2026-05-20T10:30:00.000Z",
      updatedAt: "2026-05-20T10:30:00.000Z",
    };

    renderForm({
      mode: "edit",
      transactionId: "transaction-1",
      editingTransaction,
      initialValues: {
        postedAt: "2026-05-20T10:30",
        kind: "TRANSFER",
        amount: "15",
        description: "Move to savings",
        notes: "",
        accountId: "",
        direction: "OUTFLOW",
        categoryId: "",
        counterparty: "",
        sourceAccountId: "account-bank",
        destinationAccountId: "account-savings",
        fundingMode: "SINGLE",
        fundingLegs: [
          { accountId: "", amount: "" },
          { accountId: "", amount: "" },
        ],
      },
    });

    expect(
      screen.getByText(/this transaction keeps its transfer identity/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kind")).toBeDisabled();
  });

  it("switches the posted-at field to date-only mode when times are hidden", () => {
    renderForm({
      showTransactionTimes: false,
      initialValues: {
        ...buildCreateValues(),
        postedAt: "2026-05-21",
        description: "Lunch",
        categoryId: "category-cafes",
      },
    });

    expect(screen.getByLabelText("Posted at")).toHaveAttribute("type", "date");
  });
});
