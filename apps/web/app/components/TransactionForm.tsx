"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  AiTransactionDraft,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  TransactionResponse,
} from "@finhance/shared";
import SearchablePicker from "@components/SearchablePicker";
import { getCurrencyPickerOptions } from "@lib/currency-ui";
import {
  buildTransactionPayload,
  createEmptyFundingLegs,
  type TransactionFormValues,
} from "@lib/transaction-form";
import { formatAccountOptionLabel } from "@lib/accounts";
import { formatCategoryOptionLabel } from "@lib/categories";
import {
  deriveExpensePrimaryId,
  expensePrimaryCategories,
  expenseSecondaryCategories,
  findMatchingExpenseValidationRule,
  incomeCategories,
} from "@lib/hierarchical-categories";
import {
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_DIRECTION_OPTIONS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_KIND_OPTIONS,
} from "@lib/transactions";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface TransactionFormProps {
  transactionId?: string;
  initialValues: TransactionFormValues;
  mode: "create" | "edit";
  showTransactionTimes?: boolean;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  expenseValidationRules: ExpenseValidationRuleResponse[];
  editingTransaction?: TransactionResponse | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function selectableAccounts(
  accounts: AccountResponse[],
  selectedId: string,
): AccountResponse[] {
  return accounts.filter(
    (account) => account.archivedAt === null || account.id === selectedId,
  );
}

function applyDraftDate(
  currentValue: string,
  draftDate: string,
  showTransactionTimes: boolean,
): string {
  if (!showTransactionTimes) {
    return draftDate;
  }

  const time = /T(\d{2}:\d{2})/.exec(currentValue)?.[1] ?? "12:00";
  return `${draftDate}T${time}`;
}

function findUniqueNameMatch<Candidate extends { id: string; name: string }>(
  description: string,
  candidates: Candidate[],
): string | null {
  const normalizedDescription = normalizeDraftText(description);
  if (!normalizedDescription) {
    return null;
  }

  const matches = candidates.filter((candidate) => {
    const normalizedName = normalizeDraftText(candidate.name);
    return (
      normalizedName.length >= 3 &&
      normalizedDescription.includes(normalizedName)
    );
  });

  return matches.length === 1 ? matches[0]!.id : null;
}

function normalizeDraftText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQuickAddNotice(draft: AiTransactionDraft): string {
  if (draft.kind === null) {
    return "Draft details applied, but the transaction type is unclear. Choose Expense or Income before saving.";
  }

  const typeLabel = draft.kind === "INCOME" ? "Income" : "Expense";

  if (draft.parsedBy === "groq") {
    return `${typeLabel} AI-assisted draft applied — review every field before saving. This is not financial advice.`;
  }

  if (draft.cloudAttempted) {
    return `Cloud processing was attempted, but a ${typeLabel.toLocaleLowerCase("en-US")} draft was supplied. Review every field before saving.`;
  }

  return `${typeLabel} private draft applied. You can optionally enable cloud-enhanced drafts in Settings.`;
}

export default function TransactionForm({
  transactionId,
  initialValues,
  mode,
  showTransactionTimes = true,
  accounts,
  categories,
  expenseValidationRules,
  editingTransaction,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<TransactionFormValues>(initialValues);
  const [selectedExpensePrimaryId, setSelectedExpensePrimaryId] = useState(
    deriveExpensePrimaryId(categories, initialValues.categoryId),
  );
  const [
    hasManualExpenseCategoryOverride,
    setHasManualExpenseCategoryOverride,
  ] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddNotice, setQuickAddNotice] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const formRef = useRef(form);
  const manualExpenseCategoryOverrideRef = useRef(
    hasManualExpenseCategoryOverride,
  );
  formRef.current = form;
  manualExpenseCategoryOverrideRef.current = hasManualExpenseCategoryOverride;
  const actions = useSingleFlightActions<"submit" | "draft">();
  const isCreateMode = mode === "create";
  const isTransfer = form.kind === "TRANSFER";
  const isAdjustment = form.kind === "ADJUSTMENT";
  const isExpense = form.kind === "EXPENSE";
  const isIncome = form.kind === "INCOME";
  const isSplitExpense = isExpense && form.fundingMode === "SPLIT";
  const currencyOptions = getCurrencyPickerOptions();

  useEffect(() => {
    setForm(initialValues);
    setSelectedExpensePrimaryId(
      deriveExpensePrimaryId(categories, initialValues.categoryId),
    );
    setHasManualExpenseCategoryOverride(false);
  }, [categories, initialValues]);

  const standardAccounts = useMemo(
    () => selectableAccounts(accounts, form.accountId),
    [accounts, form.accountId],
  );
  const sourceAccounts = useMemo(
    () => selectableAccounts(accounts, form.sourceAccountId),
    [accounts, form.sourceAccountId],
  );
  const destinationAccounts = useMemo(
    () => selectableAccounts(accounts, form.destinationAccountId),
    [accounts, form.destinationAccountId],
  );
  const fundingLegAccounts = useMemo(
    () =>
      form.fundingLegs.map((leg) =>
        selectableAccounts(accounts, leg.accountId),
      ),
    [accounts, form.fundingLegs],
  );
  const visibleIncomeCategories = useMemo(
    () => incomeCategories(categories, form.categoryId),
    [categories, form.categoryId],
  );
  const visibleExpensePrimaries = useMemo(
    () => expensePrimaryCategories(categories, selectedExpensePrimaryId),
    [categories, selectedExpensePrimaryId],
  );
  const visibleExpenseSecondaries = useMemo(
    () =>
      selectedExpensePrimaryId
        ? expenseSecondaryCategories(
            categories,
            selectedExpensePrimaryId,
            form.categoryId,
          )
        : [],
    [categories, form.categoryId, selectedExpensePrimaryId],
  );
  const selectedStandardAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId) ?? null,
    [accounts, form.accountId],
  );
  const selectedSourceAccount = useMemo(
    () =>
      accounts.find((account) => account.id === form.sourceAccountId) ?? null,
    [accounts, form.sourceAccountId],
  );
  const selectedDestinationAccount = useMemo(
    () =>
      accounts.find((account) => account.id === form.destinationAccountId) ??
      null,
    [accounts, form.destinationAccountId],
  );

  function updateField<Field extends keyof TransactionFormValues>(
    field: Field,
    value: TransactionFormValues[Field],
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function handleDescriptionChange(value: string) {
    setForm((previous) => ({
      ...previous,
      description: value,
    }));

    if (form.kind !== "EXPENSE" || hasManualExpenseCategoryOverride) {
      return;
    }

    const matchingRule = findMatchingExpenseValidationRule(
      expenseValidationRules,
      value,
    );
    if (!matchingRule) {
      return;
    }

    setSelectedExpensePrimaryId(matchingRule.primaryCategoryId);
    setForm((previous) => ({
      ...previous,
      description: value,
      categoryId: matchingRule.secondaryCategoryId,
    }));
  }

  async function handleQuickAdd() {
    await actions.run("draft", async () => {
      const text = quickAddText.trim();
      if (!text) {
        setQuickAddError("Describe the transaction first.");
        return;
      }

      setQuickAddError(null);
      setQuickAddNotice(null);
      setIsDrafting(true);

      try {
        const draft = await apiMutation<AiTransactionDraft>(
          "/ai/transaction-draft",
          {
            method: "POST",
            body: JSON.stringify({ text, source: "freeform" }),
          },
        );
        applyDraft(draft);
        setQuickAddNotice(buildQuickAddNotice(draft));
      } catch (draftError) {
        setQuickAddError(
          draftError instanceof Error
            ? draftError.message
            : "Unable to prepare a transaction draft.",
        );
      } finally {
        setIsDrafting(false);
      }
    });
  }

  function applyDraft(draft: AiTransactionDraft) {
    const currentForm = formRef.current;
    const nextKind = draft.kind ?? currentForm.kind;
    const selectedCategory = categories.find(
      (category) => category.id === currentForm.categoryId,
    );
    const compatibleCategoryId =
      selectedCategory?.type === nextKind ? currentForm.categoryId : "";
    const matchingRule =
      nextKind === "EXPENSE" &&
      !compatibleCategoryId &&
      !manualExpenseCategoryOverrideRef.current
        ? findMatchingExpenseValidationRule(
            expenseValidationRules,
            draft.description,
          )
        : null;
    const incomeCategoryId =
      nextKind === "INCOME" && !compatibleCategoryId
        ? findUniqueNameMatch(
            draft.description,
            categories.filter(
              (category) =>
                category.type === "INCOME" && category.archivedAt === null,
            ),
          )
        : null;
    const cashAccounts = accounts.filter(
      (account) => account.type === "CASH" && account.archivedAt === null,
    );
    const cashAccountId =
      draft.paymentMethod === "cash" && cashAccounts.length === 1
        ? cashAccounts[0]!.id
        : null;
    const namedAccountId = findUniqueNameMatch(
      draft.description,
      accounts.filter((account) => account.archivedAt === null),
    );

    setForm((previous) => ({
      ...previous,
      kind: nextKind,
      amount: draft.amount === null ? previous.amount : String(draft.amount),
      postedAt: draft.postedAt
        ? applyDraftDate(
            previous.postedAt,
            draft.postedAt,
            showTransactionTimes,
          )
        : previous.postedAt,
      description: draft.description || previous.description,
      counterparty: draft.counterparty ?? previous.counterparty,
      accountId: cashAccountId ?? namedAccountId ?? previous.accountId,
      categoryId:
        matchingRule?.secondaryCategoryId ??
        incomeCategoryId ??
        compatibleCategoryId,
      direction:
        nextKind === "INCOME"
          ? "INFLOW"
          : nextKind === "EXPENSE"
            ? "OUTFLOW"
            : previous.direction,
      fundingMode: nextKind === "EXPENSE" ? previous.fundingMode : "SINGLE",
      fundingLegs:
        nextKind === "EXPENSE"
          ? previous.fundingLegs
          : createEmptyFundingLegs(),
    }));

    if (matchingRule) {
      setSelectedExpensePrimaryId(matchingRule.primaryCategoryId);
    } else if (nextKind !== "EXPENSE") {
      setSelectedExpensePrimaryId("");
      setHasManualExpenseCategoryOverride(false);
    }
  }

  function handleExpensePrimaryChange(primaryCategoryId: string) {
    setSelectedExpensePrimaryId(primaryCategoryId);
    setHasManualExpenseCategoryOverride(primaryCategoryId !== "");
    updateField("categoryId", "");
  }

  function handleExpenseSecondaryChange(categoryId: string) {
    updateField("categoryId", categoryId);
    setHasManualExpenseCategoryOverride(categoryId !== "");
  }

  function handleFundingModeChange(nextMode: "SINGLE" | "SPLIT") {
    setForm((previous) => {
      if (nextMode === "SPLIT") {
        const seededLegs = previous.fundingLegs.some(
          (leg) => leg.accountId || leg.amount,
        )
          ? previous.fundingLegs
          : [
              {
                accountId: previous.accountId,
                amount: previous.amount,
              },
              { accountId: "", amount: "" },
            ];

        return {
          ...previous,
          fundingMode: nextMode,
          fundingLegs: seededLegs,
        };
      }

      return {
        ...previous,
        fundingMode: nextMode,
        fundingLegs: createEmptyFundingLegs(),
      };
    });
  }

  function updateFundingLeg(
    index: number,
    field: "accountId" | "amount",
    value: string,
  ) {
    setForm((previous) => ({
      ...previous,
      fundingLegs: previous.fundingLegs.map((leg, legIndex) =>
        legIndex === index ? { ...leg, [field]: value } : leg,
      ),
    }));
    setAccountError(null);
  }

  function addFundingLeg() {
    setForm((previous) => ({
      ...previous,
      fundingLegs: [...previous.fundingLegs, { accountId: "", amount: "" }],
    }));
  }

  function removeFundingLeg(index: number) {
    setForm((previous) => ({
      ...previous,
      fundingLegs:
        previous.fundingLegs.length <= 2
          ? previous.fundingLegs
          : previous.fundingLegs.filter((_, legIndex) => legIndex !== index),
    }));
    setAccountError(null);
  }

  const splitFundingTotal = form.fundingLegs.reduce((sum, leg) => {
    const amount = Number(leg.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  const transactionAmount = Number(form.amount);
  const splitFundingDifference = Number.isFinite(transactionAmount)
    ? transactionAmount - splitFundingTotal
    : null;

  function isAccountCashError(message: string): boolean {
    return (
      message.includes("no cash holding") ||
      message.includes("Insufficient cash balance")
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("submit", async () => {
      setError(null);
      setAccountError(null);

      const result = buildTransactionPayload(form, {
        showTransactionTimes,
        existingPostedAt: editingTransaction?.postedAt ?? null,
      });
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this transaction.");
        return;
      }

      if (!isCreateMode && !transactionId) {
        setError("Missing transaction id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          isCreateMode ? "/transactions" : `/transactions/${transactionId}`,
          {
            method: isCreateMode ? "POST" : "PUT",
            body: JSON.stringify(result.payload),
          },
        );

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        const message =
          submitError instanceof Error
            ? submitError.message
            : isCreateMode
              ? "Error creating transaction."
              : "Error updating transaction.";

        if (isAccountCashError(message)) {
          setAccountError(message);
        } else {
          setError(message);
        }
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="app-form">
      <section
        className="quick-add-panel"
        aria-labelledby={`${fieldPrefix}-quick-add-title`}
      >
        <div>
          <p className="section-kicker">Draft only</p>
          <h3 id={`${fieldPrefix}-quick-add-title`}>Quick add</h3>
          <p>
            Type or dictate something like “14.50 pizza yesterday amex”. We will
            fill a draft for you to review.
          </p>
        </div>
        <div className="quick-add-controls">
          <label htmlFor={`${fieldPrefix}-quick-add`}>
            Transaction details
          </label>
          <div className="quick-add-input-row">
            <input
              id={`${fieldPrefix}-quick-add`}
              value={quickAddText}
              onChange={(event) => setQuickAddText(event.target.value)}
              placeholder="e.g. 14.50 pizza yesterday amex"
              disabled={isDrafting}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleQuickAdd}
              disabled={isDrafting}
            >
              {isDrafting ? "Preparing…" : "Prepare draft"}
            </button>
          </div>
        </div>
        {quickAddError ? (
          <p className="app-form-field-error" role="alert">
            {quickAddError}
          </p>
        ) : null}
        {quickAddNotice ? (
          <p className="quick-add-notice">
            {quickAddNotice}{" "}
            {quickAddNotice.startsWith("Basic") ? (
              <a href="/settings/user">Settings</a>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-description`}>Description</label>
        <input
          id={`${fieldPrefix}-description`}
          value={form.description}
          onChange={(event) => handleDescriptionChange(event.target.value)}
          required
        />
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-posted-at`}>Posted at</label>
          <input
            id={`${fieldPrefix}-posted-at`}
            type={showTransactionTimes ? "datetime-local" : "date"}
            value={form.postedAt}
            onChange={(event) => updateField("postedAt", event.target.value)}
            required
          />
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-kind`}>Kind</label>
          <select
            id={`${fieldPrefix}-kind`}
            value={form.kind}
            disabled={!isCreateMode}
            onChange={(event) => {
              const nextKind = event.target
                .value as TransactionFormValues["kind"];
              setForm((previous) => ({
                ...previous,
                kind: nextKind,
                fundingMode:
                  nextKind === "EXPENSE" ? previous.fundingMode : "SINGLE",
                fundingLegs:
                  nextKind === "EXPENSE"
                    ? previous.fundingLegs
                    : createEmptyFundingLegs(),
              }));
              if (nextKind === "EXPENSE") {
                setSelectedExpensePrimaryId(
                  deriveExpensePrimaryId(categories, form.categoryId),
                );
              } else {
                setSelectedExpensePrimaryId("");
                setHasManualExpenseCategoryOverride(false);
              }
            }}
          >
            {TRANSACTION_KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {TRANSACTION_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-amount`}>Amount</label>
          <input
            id={`${fieldPrefix}-amount`}
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            required
          />
        </div>

        {isTransfer ? (
          <div className="app-form-note">
            Transfers create one outflow row and one inflow row underneath.
          </div>
        ) : isExpense ? (
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-funding-mode`}>Funding</label>
            <select
              id={`${fieldPrefix}-funding-mode`}
              value={form.fundingMode}
              onChange={(event) =>
                handleFundingModeChange(
                  event.target.value as "SINGLE" | "SPLIT",
                )
              }
            >
              <option value="SINGLE">Single account</option>
              <option value="SPLIT">Split across accounts</option>
            </select>
          </div>
        ) : (
          <div className={`app-form-field${accountError ? " has-error" : ""}`}>
            <label htmlFor={`${fieldPrefix}-account`}>Account</label>
            <select
              id={`${fieldPrefix}-account`}
              value={form.accountId}
              onChange={(event) => {
                updateField("accountId", event.target.value);
                setAccountError(null);
              }}
              required
            >
              <option value="">Select an account</option>
              {standardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
            {accountError ? (
              <p className="app-form-field-error">{accountError}</p>
            ) : null}
          </div>
        )}
      </div>

      {!isTransfer && isExpense && !isSplitExpense ? (
        <div className={`app-form-field${accountError ? " has-error" : ""}`}>
          <label htmlFor={`${fieldPrefix}-account`}>Account</label>
          <select
            id={`${fieldPrefix}-account`}
            value={form.accountId}
            onChange={(event) => {
              updateField("accountId", event.target.value);
              setAccountError(null);
            }}
            required
          >
            <option value="">Select an account</option>
            {standardAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {formatAccountOptionLabel(account)}
              </option>
            ))}
          </select>
          {accountError ? (
            <p className="app-form-field-error">{accountError}</p>
          ) : null}
        </div>
      ) : null}

      {!isTransfer && isSplitExpense ? (
        <div className={`detail-panel${accountError ? " has-error" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Funding legs
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Split one expense across multiple accounts.
              </p>
            </div>
            <button
              type="button"
              onClick={addFundingLeg}
              className="btn-secondary"
            >
              Add leg
            </button>
          </div>

          <div className="mt-4 list-stack">
            {form.fundingLegs.map((leg, index) => (
              <div
                key={`${fieldPrefix}-leg-${index}`}
                className="app-form-grid is-relaxed"
              >
                <div className="app-form-field">
                  <label htmlFor={`${fieldPrefix}-funding-account-${index}`}>
                    Account {index + 1}
                  </label>
                  <select
                    id={`${fieldPrefix}-funding-account-${index}`}
                    value={leg.accountId}
                    onChange={(event) =>
                      updateFundingLeg(index, "accountId", event.target.value)
                    }
                  >
                    <option value="">Select an account</option>
                    {fundingLegAccounts[index]?.map((account) => (
                      <option key={account.id} value={account.id}>
                        {formatAccountOptionLabel(account)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="app-form-field">
                  <label htmlFor={`${fieldPrefix}-funding-amount-${index}`}>
                    Leg amount
                  </label>
                  <input
                    id={`${fieldPrefix}-funding-amount-${index}`}
                    type="number"
                    step="0.01"
                    value={leg.amount}
                    onChange={(event) =>
                      updateFundingLeg(index, "amount", event.target.value)
                    }
                  />
                </div>

                <div className="app-form-field">
                  <label className="is-optional">
                    <span>Remove</span>
                    <span>Optional</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeFundingLeg(index)}
                    disabled={form.fundingLegs.length <= 2}
                    className="btn-secondary"
                  >
                    Remove leg
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
            <span>Total funded: {splitFundingTotal.toFixed(2)}</span>
            {splitFundingDifference === null ? null : (
              <span>Difference: {splitFundingDifference.toFixed(2)}</span>
            )}
          </div>

          {accountError ? (
            <p className="mt-3 app-form-field-error">{accountError}</p>
          ) : null}
        </div>
      ) : null}

      {!isTransfer && !isSplitExpense && !isAdjustment ? (
        <div className="app-form-grid is-relaxed">
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-native-amount`}>
              Original amount
            </label>
            <input
              id={`${fieldPrefix}-native-amount`}
              type="number"
              step="0.01"
              value={form.nativeAmount}
              onChange={(event) =>
                updateField("nativeAmount", event.target.value)
              }
              placeholder="Optional"
            />
          </div>
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-native-currency`}>
              Original currency
            </label>
            <SearchablePicker
              id={`${fieldPrefix}-native-currency`}
              value={form.nativeCurrency ?? ""}
              onChange={(nextValue) => updateField("nativeCurrency", nextValue)}
              options={currencyOptions}
              placeholder={selectedStandardAccount?.currency ?? "EUR"}
              searchPlaceholder="Search currencies…"
              allowClear
              clearLabel={`Use ${selectedStandardAccount?.currency ?? "account currency"}`}
            />
          </div>
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-fx-rate`}>FX rate override</label>
            <input
              id={`${fieldPrefix}-fx-rate`}
              type="number"
              step="0.000001"
              value={form.fxRateUsed}
              onChange={(event) =>
                updateField("fxRateUsed", event.target.value)
              }
              placeholder="Leave blank for live FX"
            />
          </div>
        </div>
      ) : null}

      {isTransfer ? (
        <>
          <div className="app-form-grid is-relaxed">
            <div
              className={`app-form-field${accountError ? " has-error" : ""}`}
            >
              <label htmlFor={`${fieldPrefix}-source-account`}>
                Source account
              </label>
              <select
                id={`${fieldPrefix}-source-account`}
                value={form.sourceAccountId}
                onChange={(event) => {
                  updateField("sourceAccountId", event.target.value);
                  setAccountError(null);
                }}
                required
              >
                <option value="">Select a source account</option>
                {sourceAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountOptionLabel(account)}
                  </option>
                ))}
              </select>
              {accountError ? (
                <p className="app-form-field-error">{accountError}</p>
              ) : null}
            </div>

            <div className="app-form-field">
              <label htmlFor={`${fieldPrefix}-destination-account`}>
                Destination account
              </label>
              <select
                id={`${fieldPrefix}-destination-account`}
                value={form.destinationAccountId}
                onChange={(event) =>
                  updateField("destinationAccountId", event.target.value)
                }
                required
              >
                <option value="">Select a destination account</option>
                {destinationAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountOptionLabel(account)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="app-form-grid is-relaxed">
            <div className="app-form-field">
              <label htmlFor={`${fieldPrefix}-source-amount`}>
                Source amount
              </label>
              <input
                id={`${fieldPrefix}-source-amount`}
                type="number"
                step="0.01"
                value={form.sourceAmount}
                onChange={(event) =>
                  updateField("sourceAmount", event.target.value)
                }
                placeholder={form.amount || "Optional"}
              />
              {selectedSourceAccount ? (
                <p className="text-xs text-[var(--text-tertiary)]">
                  {selectedSourceAccount.currency}
                </p>
              ) : null}
            </div>
            <div className="app-form-field">
              <label htmlFor={`${fieldPrefix}-destination-amount`}>
                Destination amount
              </label>
              <input
                id={`${fieldPrefix}-destination-amount`}
                type="number"
                step="0.01"
                value={form.destinationAmount}
                onChange={(event) =>
                  updateField("destinationAmount", event.target.value)
                }
                placeholder="Leave blank for live FX"
              />
              {selectedDestinationAccount ? (
                <p className="text-xs text-[var(--text-tertiary)]">
                  {selectedDestinationAccount.currency}
                </p>
              ) : null}
            </div>
            <div className="app-form-field">
              <label htmlFor={`${fieldPrefix}-transfer-fx-rate`}>
                FX rate override
              </label>
              <input
                id={`${fieldPrefix}-transfer-fx-rate`}
                type="number"
                step="0.000001"
                value={form.fxRateUsed}
                onChange={(event) =>
                  updateField("fxRateUsed", event.target.value)
                }
                placeholder="Leave blank for live FX"
              />
            </div>
          </div>
        </>
      ) : null}

      {!isTransfer && isAdjustment ? (
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-direction`}>Direction</label>
          <select
            id={`${fieldPrefix}-direction`}
            value={form.direction}
            onChange={(event) =>
              updateField(
                "direction",
                event.target.value as TransactionFormValues["direction"],
              )
            }
          >
            {TRANSACTION_DIRECTION_OPTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {TRANSACTION_DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!isTransfer ? (
        <div className="app-form-grid is-relaxed">
          {!isAdjustment && isExpense ? (
            <>
              <div className="app-form-field">
                <label htmlFor={`${fieldPrefix}-primary-category`}>
                  <span>Primary</span>
                </label>
                <select
                  id={`${fieldPrefix}-primary-category`}
                  value={selectedExpensePrimaryId}
                  onChange={(event) =>
                    handleExpensePrimaryChange(event.target.value)
                  }
                >
                  <option value="">Select primary…</option>
                  {visibleExpensePrimaries.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-form-field">
                <label htmlFor={`${fieldPrefix}-secondary-category`}>
                  <span>Secondary</span>
                </label>
                <select
                  id={`${fieldPrefix}-secondary-category`}
                  value={form.categoryId}
                  onChange={(event) =>
                    handleExpenseSecondaryChange(event.target.value)
                  }
                >
                  <option value="">Select secondary…</option>
                  {visibleExpenseSecondaries.map((category) => (
                    <option key={category.id} value={category.id}>
                      {formatCategoryOptionLabel(category)}
                    </option>
                  ))}
                </select>
                {selectedExpensePrimaryId &&
                !visibleExpenseSecondaries.length ? (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No secondary categories under this primary.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {!isAdjustment && isIncome ? (
            <div className="app-form-field">
              <label htmlFor={`${fieldPrefix}-category`}>
                <span>Category</span>
              </label>
              <select
                id={`${fieldPrefix}-category`}
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
              >
                <option value="">Select category…</option>
                {visibleIncomeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryOptionLabel(category)}
                  </option>
                ))}
              </select>
              {!visibleIncomeCategories.length ? (
                <p className="text-xs text-[var(--text-tertiary)]">
                  No matching categories available.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="app-form-field">
            <label
              htmlFor={`${fieldPrefix}-counterparty`}
              className="is-optional"
            >
              <span>Counterparty</span>
              <span>Optional</span>
            </label>
            <input
              id={`${fieldPrefix}-counterparty`}
              value={form.counterparty}
              onChange={(event) =>
                updateField("counterparty", event.target.value)
              }
            />
          </div>
        </div>
      ) : null}

      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-notes`} className="is-optional">
          <span>Notes</span>
          <span>Optional</span>
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="min-h-24"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      {editingTransaction?.kind === "TRANSFER" ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          This transaction keeps its transfer identity. To convert it into a
          non-transfer entry, delete it and create a new one.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="app-form-error">
          {error}
        </p>
      ) : null}

      <div className="app-form-actions">
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting
            ? "Saving..."
            : isCreateMode
              ? "Create Transaction"
              : "Save Changes"}
        </button>

        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
