/**
 * Tiny in-memory finhance API mock for developing and demoing the mobile app
 * without a real backend. Read-only: mutations return plausible responses but
 * nothing persists.
 *
 *   node scripts/mock-api.mjs [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4243);

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth(); // 0-based
const ym = (offset = 0) => {
  const d = new Date(year, month + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const day = (d, offset = 0) =>
  new Date(year, month + offset, d, 12, 30).toISOString();

const ts = "2026-01-01T09:00:00.000Z";
const base = { createdAt: ts, updatedAt: ts };
const deletable = { canDeletePermanently: false, deleteBlockReason: "in use" };

const accounts = [
  {
    id: "acc-bank",
    name: "Main current",
    type: "BANK",
    currency: "EUR",
    institution: "Intesa",
    notes: null,
    order: 0,
    openingBalance: 4200,
    openingBalanceDate: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "acc-savings",
    name: "Savings",
    type: "BANK",
    currency: "EUR",
    institution: "Intesa",
    notes: null,
    order: 1,
    openingBalance: 12000,
    openingBalanceDate: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "acc-card",
    name: "Credit card",
    type: "CARD",
    currency: "EUR",
    institution: "Amex",
    notes: null,
    order: 2,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "acc-broker",
    name: "Interactive Brokers",
    type: "BROKER",
    currency: "USD",
    institution: "IBKR",
    notes: null,
    order: 3,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "acc-cash",
    name: "Wallet",
    type: "CASH",
    currency: "EUR",
    institution: null,
    notes: null,
    order: 4,
    openingBalance: 150,
    openingBalanceDate: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
    ...deletable,
    ...base,
  },
];

const categories = [
  {
    id: "cat-living",
    name: "Living",
    type: "EXPENSE",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 0,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-groceries",
    name: "Groceries",
    type: "EXPENSE",
    parentCategoryId: "cat-living",
    parentCategoryName: "Living",
    isPrimary: false,
    isSecondary: true,
    order: 1,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-rent",
    name: "Rent",
    type: "EXPENSE",
    parentCategoryId: "cat-living",
    parentCategoryName: "Living",
    isPrimary: false,
    isSecondary: true,
    order: 2,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-lifestyle",
    name: "Lifestyle",
    type: "EXPENSE",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 3,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-eating",
    name: "Eating out",
    type: "EXPENSE",
    parentCategoryId: "cat-lifestyle",
    parentCategoryName: "Lifestyle",
    isPrimary: false,
    isSecondary: true,
    order: 4,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-travel",
    name: "Travel",
    type: "EXPENSE",
    parentCategoryId: "cat-lifestyle",
    parentCategoryName: "Lifestyle",
    isPrimary: false,
    isSecondary: true,
    order: 5,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-salary",
    name: "Salary",
    type: "INCOME",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 6,
    archivedAt: null,
    ...deletable,
    ...base,
  },
  {
    id: "cat-dividends",
    name: "Dividends",
    type: "INCOME",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 7,
    archivedAt: null,
    ...deletable,
    ...base,
  },
];

const cat = (id) => {
  const c = categories.find((x) => x.id === id);
  if (!c)
    return {
      categoryId: null,
      primaryCategoryId: null,
      primaryCategoryName: null,
      secondaryCategoryId: null,
      secondaryCategoryName: null,
    };
  if (c.parentCategoryId) {
    return {
      categoryId: c.id,
      primaryCategoryId: c.parentCategoryId,
      primaryCategoryName: c.parentCategoryName,
      secondaryCategoryId: c.id,
      secondaryCategoryName: c.name,
    };
  }
  return {
    categoryId: c.id,
    primaryCategoryId: c.id,
    primaryCategoryName: c.name,
    secondaryCategoryId: null,
    secondaryCategoryName: null,
  };
};

const txDefaults = {
  notes: null,
  counterparty: null,
  sourceAccountId: null,
  destinationAccountId: null,
  recurringRuleId: null,
  recurringOccurrenceMonth: null,
  isRecurringGenerated: false,
  ...base,
};

const transactions = [
  {
    id: "tx-1",
    postedAt: day(1),
    amount: 3200,
    currency: "EUR",
    kind: "INCOME",
    accountId: "acc-bank",
    direction: "INFLOW",
    ...cat("cat-salary"),
    description: "Salary",
    counterparty: "ACME S.p.A.",
    ...txDefaults,
    isRecurringGenerated: true,
    recurringRuleId: "rule-salary",
    recurringOccurrenceMonth: ym(),
  },
  {
    id: "tx-2",
    postedAt: day(1),
    amount: 1150,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "acc-bank",
    direction: "OUTFLOW",
    ...cat("cat-rent"),
    description: "Monthly rent",
    counterparty: "Landlord",
    ...txDefaults,
    isRecurringGenerated: true,
    recurringRuleId: "rule-rent",
    recurringOccurrenceMonth: ym(),
  },
  {
    id: "tx-3",
    postedAt: day(3),
    amount: 86.4,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "acc-card",
    direction: "OUTFLOW",
    ...cat("cat-groceries"),
    description: "Esselunga",
    counterparty: "Esselunga",
    ...txDefaults,
  },
  {
    id: "tx-4",
    postedAt: day(4),
    amount: 500,
    currency: "EUR",
    kind: "TRANSFER",
    accountId: null,
    direction: null,
    ...cat(null),
    description: "Savings top-up",
    sourceAccountId: "acc-bank",
    destinationAccountId: "acc-savings",
    ...txDefaults,
    sourceAmount: 500,
    destinationAmount: 500,
    sourceCurrency: "EUR",
    destinationCurrency: "EUR",
  },
  {
    id: "tx-5",
    postedAt: day(6),
    amount: 42.5,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "acc-card",
    direction: "OUTFLOW",
    ...cat("cat-eating"),
    description: "Trattoria da Mario",
    counterparty: "Da Mario",
    ...txDefaults,
  },
  {
    id: "tx-6",
    postedAt: day(7),
    amount: 240,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "acc-bank",
    direction: "OUTFLOW",
    ...cat("cat-travel"),
    description: "Train to Rome",
    counterparty: "Trenitalia",
    ...txDefaults,
  },
  {
    id: "tx-7",
    postedAt: day(8),
    amount: 64.2,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "acc-card",
    direction: "OUTFLOW",
    ...cat("cat-groceries"),
    description: "Groceries",
    ...txDefaults,
  },
  {
    id: "tx-8",
    postedAt: day(9),
    amount: 18.9,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "acc-cash",
    direction: "OUTFLOW",
    ...cat("cat-eating"),
    description: "Pizza night",
    ...txDefaults,
  },
  {
    id: "tx-9",
    postedAt: day(9),
    amount: 25,
    currency: "EUR",
    kind: "ADJUSTMENT",
    accountId: "acc-cash",
    direction: "INFLOW",
    ...cat(null),
    description: "Cash count fix",
    ...txDefaults,
  },
];

const cashflowSummary = [
  {
    currency: "EUR",
    incomeTotal: 3200,
    expenseTotal: 1452,
    adjustmentInTotal: 25,
    adjustmentOutTotal: 0,
    netCashflow: 1773,
    byCategory: [],
    byAccount: [],
  },
];

const monthPoint = (m, income, expense) => ({
  month: m,
  incomeTotal: income,
  expenseTotal: expense,
  netCashflow: income - expense,
  adjustmentInTotal: 0,
  adjustmentOutTotal: 0,
  uncategorizedExpenseTotal: 0,
  uncategorizedIncomeTotal: 0,
});

const breakdown = [
  { ...cat("cat-rent"), name: "Rent", total: 1150 },
  { ...cat("cat-groceries"), name: "Groceries", total: 150.6 },
  { ...cat("cat-travel"), name: "Travel", total: 240 },
  { ...cat("cat-eating"), name: "Eating out", total: 61.4 },
];

const analytics = {
  from: `${ym(-5)}-01`,
  to: `${ym()}-30`,
  focusMonth: ym(),
  reportingOverview: {
    reportingCurrency: "EUR",
    averageMonthlyExpense: 1571,
    averageMonthlyIncome: 3233,
    focusMonthIncomeTotal: 3200,
    focusMonthExpenseTotal: 1452,
    focusMonthNetCashflow: 1748,
    monthlySeries: [],
  },
  currencies: [
    {
      currency: "EUR",
      averageMonthlyExpense: 1571,
      averageMonthlyIncome: 3233,
      monthlySeries: [
        monthPoint(ym(-5), 3200, 1680),
        monthPoint(ym(-4), 3200, 1495),
        monthPoint(ym(-3), 3400, 1760),
        monthPoint(ym(-2), 3200, 1540),
        monthPoint(ym(-1), 3200, 1499),
        monthPoint(ym(0), 3200, 1452),
      ],
      focusMonthExpenseBreakdown: breakdown,
      focusMonthIncomeBreakdown: [
        { ...cat("cat-salary"), name: "Salary", total: 3200 },
      ],
      expenseCategoryTrends: [
        {
          ...cat("cat-rent"),
          name: "Rent",
          total: 6900,
          series: Array.from({ length: 6 }, (_, i) => ({
            month: ym(i - 5),
            total: 1150,
          })),
        },
        {
          ...cat("cat-groceries"),
          name: "Groceries",
          total: 1010,
          series: [120, 180, 210, 175, 174, 151].map((t, i) => ({
            month: ym(i - 5),
            total: t,
          })),
        },
        {
          ...cat("cat-eating"),
          name: "Eating out",
          total: 540,
          series: [80, 110, 95, 120, 74, 61].map((t, i) => ({
            month: ym(i - 5),
            total: t,
          })),
        },
      ],
      incomeCategoryTrends: [],
      expenseMonthOverMonthChanges: [
        {
          ...cat("cat-travel"),
          name: "Travel",
          previousTotal: 60,
          currentTotal: 240,
          delta: 180,
        },
        {
          ...cat("cat-groceries"),
          name: "Groceries",
          previousTotal: 174,
          currentTotal: 151,
          delta: -23,
        },
      ],
      incomeMonthOverMonthChanges: [],
    },
  ],
};

const budgetItem = (id, categoryId, amount, spent, override = null) => ({
  budgetId: id,
  ...cat(categoryId),
  categoryName: categories.find((c) => c.id === categoryId)?.name ?? "?",
  categoryArchivedAt: null,
  currency: "EUR",
  budgetAmount: amount,
  spentAmount: spent,
  remainingAmount: amount - spent,
  usageRatio: amount > 0 ? spent / amount : null,
  status:
    spent > amount
      ? "OVER_BUDGET"
      : spent / amount > 0.95
        ? "AT_LIMIT"
        : "WITHIN_BUDGET",
  previousMonthExpense: spent * 1.1,
  averageExpenseLast3Months: spent * 1.05,
  startMonth: "2025-01",
  endMonth: null,
  override,
});

const budgets = {
  month: ym(),
  includeArchivedCategories: false,
  reportingOverview: null,
  currencies: [
    {
      currency: "EUR",
      budgetTotal: 1730,
      spentTotal: 1602,
      remainingTotal: 128,
      overBudgetTotal: 40,
      overBudgetCount: 1,
      budgetedCategoryCount: 4,
      unbudgetedExpenseTotal: 18.9,
      uncategorizedExpenseTotal: 0,
      items: [
        budgetItem("bud-rent", "cat-rent", 1150, 1150),
        budgetItem("bud-groceries", "cat-groceries", 220, 150.6),
        budgetItem("bud-eating", "cat-eating", 80, 120, {
          id: "ovr-1",
          categoryBudgetId: "bud-eating",
          month: ym(),
          amount: 80,
          note: "Guests in town",
          ...base,
        }),
        budgetItem("bud-travel", "cat-travel", 280, 240),
      ],
      overBudgetHighlights: [budgetItem("bud-eating", "cat-eating", 80, 120)],
      unbudgetedCategories: [],
    },
  ],
};

const dashboardAssets = [
  {
    id: "as-cash-bank",
    name: "Current balance",
    type: "ASSET",
    accountId: "acc-bank",
    kind: "CASH",
    liabilityKind: null,
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    balance: 5320.4,
    currency: "EUR",
    notes: null,
    order: 0,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: "Main current",
    accountType: "BANK",
    currentValue: 5320.4,
    referenceValue: 5320.4,
    valuationSource: "DIRECT_BALANCE",
    valuationAsOf: ts,
    isStale: false,
  },
  {
    id: "as-savings",
    name: "Savings balance",
    type: "ASSET",
    accountId: "acc-savings",
    kind: "CASH",
    liabilityKind: null,
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    balance: 14500,
    currency: "EUR",
    notes: null,
    order: 1,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: "Savings",
    accountType: "BANK",
    currentValue: 14500,
    referenceValue: 14500,
    valuationSource: "DIRECT_BALANCE",
    valuationAsOf: ts,
    isStale: false,
  },
  {
    id: "as-vwce",
    name: "Vanguard FTSE All-World",
    type: "ASSET",
    accountId: "acc-broker",
    kind: "STOCK",
    liabilityKind: null,
    ticker: "VWCE",
    exchange: "MIL",
    quantity: 120,
    unitPrice: 98.5,
    balance: 11820,
    currency: "EUR",
    notes: null,
    order: 2,
    lastPrice: 112.4,
    lastPriceAt: ts,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: "Interactive Brokers",
    accountType: "BROKER",
    currentValue: 13488,
    referenceValue: 11820,
    valuationSource: "LIVE",
    valuationAsOf: ts,
    isStale: false,
  },
  {
    id: "as-btc",
    name: "Bitcoin",
    type: "ASSET",
    accountId: null,
    kind: "CRYPTO",
    liabilityKind: null,
    ticker: "BTC-EUR",
    exchange: null,
    quantity: 0.12,
    unitPrice: 38000,
    balance: 4560,
    currency: "EUR",
    notes: null,
    order: 3,
    lastPrice: 61250,
    lastPriceAt: ts,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: null,
    accountType: null,
    currentValue: 7350,
    referenceValue: 4560,
    valuationSource: "LAST_QUOTE",
    valuationAsOf: ts,
    isStale: true,
  },
  {
    id: "li-card",
    name: "Card balance",
    type: "LIABILITY",
    accountId: "acc-card",
    kind: null,
    liabilityKind: "DEBT",
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    balance: 212,
    currency: "EUR",
    notes: null,
    order: 4,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: "Credit card",
    accountType: "CARD",
    currentValue: 212,
    referenceValue: 212,
    valuationSource: "DIRECT_BALANCE",
    valuationAsOf: ts,
    isStale: false,
  },
  {
    id: "li-tax",
    name: "Tax due",
    type: "LIABILITY",
    accountId: null,
    kind: null,
    liabilityKind: "TAX",
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    balance: 900,
    currency: "EUR",
    notes: null,
    order: 5,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: null,
    accountType: null,
    currentValue: 900,
    referenceValue: 900,
    valuationSource: "DIRECT_BALANCE",
    valuationAsOf: ts,
    isStale: false,
  },
];

const dashboard = {
  reportingCurrency: "EUR",
  assets: dashboardAssets,
  summary: { assets: 40658.4, liabilities: 1112, netWorth: 39546.4 },
  pricingStatus: {
    state: "PARTIAL",
    refreshSuggested: true,
    hasStaleQuotes: true,
    hasStaleFx: false,
    hasMissingFx: false,
  },
  assetKindOrder: ["CASH", "STOCK", "CRYPTO"],
  lastRefreshAt: day(9),
  latestSnapshotDate: `${ym(-1)}-30T00:00:00.000Z`,
  latestSnapshotCapturedAt: day(0, -1),
  latestSnapshotIsPartial: false,
};

const setup = {
  isComplete: false,
  currentMonth: ym(),
  requiredCompletedCount: 4,
  requiredTotalCount: 5,
  requiredSteps: [
    {
      code: "ACCOUNTS",
      title: "Create your accounts",
      detail: "5 active accounts",
      status: "COMPLETE",
      href: "/accounts",
      actionLabel: "Open",
    },
    {
      code: "CATEGORIES",
      title: "Organise categories",
      detail: "8 active categories",
      status: "COMPLETE",
      href: "/categories",
      actionLabel: "Open",
    },
    {
      code: "REPORTING_CURRENCY",
      title: "Pick a reporting currency",
      detail: "EUR configured",
      status: "COMPLETE",
      href: "/settings",
      actionLabel: "Open",
    },
    {
      code: "RECURRING",
      title: "Add recurring rules",
      detail: "2 active rules",
      status: "COMPLETE",
      href: "/recurring",
      actionLabel: "Open",
    },
    {
      code: "BUDGETS",
      title: "Budget this month",
      detail: "Cover your top categories",
      status: "INCOMPLETE",
      href: "/budgets",
      actionLabel: "Open",
    },
  ],
  recommendedSteps: [],
  warnings: [
    {
      code: "NO_SNAPSHOT_YET",
      severity: "INFO",
      title: "Capture a snapshot",
      detail: "Preserve this month's closing net worth.",
      href: "/history",
      actionLabel: "Open",
      count: null,
    },
  ],
  handoff: [],
  activeAccountCount: 5,
  activeIncomeCategoryCount: 2,
  activeExpenseCategoryCount: 6,
  activeRecurringRuleCount: 2,
  currentMonthBudgetCount: 4,
  hasAppliedImportBatch: false,
  hasSnapshot: true,
  hasReportingCurrencyConfigured: true,
};

const reconciliations = accounts.map((account, index) => ({
  status: index === 2 ? "MISMATCH" : "CLEAN",
  accountId: account.id,
  accountName: account.name,
  accountType: account.type,
  currency: account.currency,
  reconciliationScope: account.type === "BROKER" ? "CASH_ONLY" : "FULL_BALANCE",
  baselineMode: "OPENING_BALANCE",
  trackedBalance: [5320.4, 14500, -212, 1240, 156.1][index] ?? 0,
  expectedBalance: [5320.4, 14500, -172, 1240, 156.1][index] ?? 0,
  delta: index === 2 ? -40 : 0,
  assetCount: 1,
  transactionCount: 12,
  issueCodes: [],
  diagnostics:
    index === 2
      ? [
          {
            code: "BASELINE_POSSIBLY_STALE",
            severity: "WARNING",
            summary: "Tracked liability drifted from activity.",
            likelyCause: "A card payment was not recorded.",
            recommendedAction: "Add the missing expense or post an adjustment.",
          },
        ]
      : [],
  canCreateAdjustment: index === 2,
  canEstablishOpeningBalanceBaseline: false,
  openingBalanceBaselineGuidance: null,
  adjustmentGuidance: {
    status: index === 2 ? "SAFE" : "SAFE",
    message:
      index === 2
        ? "The gap looks like one missing expense."
        : "Nothing to fix.",
  },
}));

const recurringRules = [
  {
    id: "rule-salary",
    name: "Salary",
    isActive: true,
    kind: "INCOME",
    amount: 3200,
    dayOfMonth: 1,
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: null,
    accountId: "acc-bank",
    direction: "INFLOW",
    ...cat("cat-salary"),
    counterparty: "ACME S.p.A.",
    sourceAccountId: null,
    destinationAccountId: null,
    description: "Salary",
    notes: null,
    lastMaterializationError: null,
    lastMaterializationErrorAt: null,
    ...base,
  },
  {
    id: "rule-rent",
    name: "Rent",
    isActive: true,
    kind: "EXPENSE",
    amount: 1150,
    dayOfMonth: 1,
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: null,
    accountId: "acc-bank",
    direction: "OUTFLOW",
    ...cat("cat-rent"),
    counterparty: "Landlord",
    sourceAccountId: null,
    destinationAccountId: null,
    description: "Monthly rent",
    notes: null,
    lastMaterializationError: null,
    lastMaterializationErrorAt: null,
    ...base,
  },
  {
    id: "rule-gym",
    name: "Gym",
    isActive: false,
    kind: "EXPENSE",
    amount: 45,
    dayOfMonth: 5,
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: null,
    accountId: "acc-card",
    direction: "OUTFLOW",
    ...cat("cat-lifestyle"),
    counterparty: null,
    sourceAccountId: null,
    destinationAccountId: null,
    description: "Gym membership",
    notes: null,
    lastMaterializationError: null,
    lastMaterializationErrorAt: null,
    ...base,
  },
];

const review = {
  month: ym(),
  reportingCurrency: "EUR",
  cashflow: cashflowSummary,
  openingNetWorth: 38120.2,
  closingNetWorth: 39546.4,
  netWorthDelta: 1426.2,
  openingSnapshotDate: `${ym(-1)}-30`,
  closingSnapshotDate: null,
  warnings: [
    {
      code: "MISSING_CLOSING_SNAPSHOT",
      severity: "INFO",
      title: "No closing snapshot yet",
      detail: "Capture one near month end to lock this month's boundary.",
      count: null,
      amount: null,
      currency: null,
    },
    {
      code: "OVER_BUDGET_CATEGORIES",
      severity: "WARNING",
      title: "1 category over budget",
      detail: "Eating out exceeded its monthly plan.",
      count: 1,
      amount: 40,
      currency: "EUR",
    },
  ],
  netWorthExplanation: {
    reportingCurrency: "EUR",
    isComparableInReportingCurrency: true,
    cashflowContribution: 1773,
    marketAndFxMovement: -346.8,
    note: null,
  },
  recurringComparison: [
    {
      currency: "EUR",
      expectedIncomeTotal: 3200,
      actualIncomeTotal: 3200,
      expectedExpenseTotal: 1150,
      actualExpenseTotal: 1150,
      dueRuleCount: 2,
      realizedRuleCount: 2,
      skippedCount: 0,
      overriddenCount: 0,
      transferRulesExcludedCount: 0,
    },
  ],
  currencyInsights: [
    {
      currency: "EUR",
      savingsRate: 0.55,
      uncategorizedExpenseTotal: 0,
      uncategorizedIncomeTotal: 0,
      topExpenseCategories: breakdown,
      topIncomeCategories: [
        { ...cat("cat-salary"), name: "Salary", total: 3200 },
      ],
      topAccounts: [],
    },
  ],
  budgetSummary: budgets.currencies,
  budgetHighlights: budgets.currencies[0].overBudgetHighlights,
  reconciliationHighlights: reconciliations.filter(
    (r) => r.status === "MISMATCH",
  ),
  recurringExceptions: [],
};

const snapshots = [
  {
    id: "snap-2",
    snapshotDate: `${ym(-1)}-30`,
    capturedAt: day(0, -1),
    reportingCurrency: "EUR",
    storedReportingCurrency: "EUR",
    assetsTotal: 39120.2,
    liabilitiesTotal: 1000,
    netWorthTotal: 38120.2,
    unavailableCount: 0,
    isPartial: false,
    canRecomputeForReportingCurrency: true,
    ...base,
  },
  {
    id: "snap-1",
    snapshotDate: `${ym(-2)}-30`,
    capturedAt: day(0, -2),
    reportingCurrency: "EUR",
    storedReportingCurrency: "EUR",
    assetsTotal: 37890,
    liabilitiesTotal: 1150,
    netWorthTotal: 36740,
    unavailableCount: 1,
    isPartial: true,
    canRecomputeForReportingCurrency: false,
    ...base,
  },
];

const brokerSummary = {
  account: accounts[3],
  totalValue: 15890.5,
  cashAvailable: 1240,
  investedValue: 14650.5,
  unrealisedGainLoss: 1830.5,
  activePositionCount: 2,
};

const workspace = {
  reportingCurrency: "EUR",
  pricingStatus: dashboard.pricingStatus,
  brokers: [brokerSummary],
  selectedBroker: brokerSummary,
  cashReconciliation: reconciliations[3],
  positions: [
    {
      assetId: "as-vwce",
      name: "Vanguard FTSE All-World",
      kind: "STOCK",
      ticker: "VWCE",
      exchange: "MIL",
      currency: "USD",
      quantity: 120,
      averageCostPerUnit: 98.5,
      costBasis: 11820,
      currentPrice: 112.4,
      currentValue: 13488,
      unrealisedGainLoss: 1668,
      percentOfBrokerage: 84.9,
      percentOfPortfolio: 33.2,
      targetPercent: 80,
      deltaPercent: 4.9,
      deltaValue: 778,
      valuationSource: "LIVE",
      valuationAsOf: ts,
      isStale: false,
    },
    {
      assetId: "as-tlt",
      name: "iShares 20+ Treasury",
      kind: "BOND",
      ticker: "TLT",
      exchange: "NASDAQ",
      currency: "USD",
      quantity: 12,
      averageCostPerUnit: 96.9,
      costBasis: 1162.5,
      currentPrice: 96.9,
      currentValue: 1162.5,
      unrealisedGainLoss: 162.5,
      percentOfBrokerage: 7.3,
      percentOfPortfolio: 2.9,
      targetPercent: 20,
      deltaPercent: -12.7,
      deltaValue: -2015,
      valuationSource: "LAST_QUOTE",
      valuationAsOf: ts,
      isStale: true,
    },
  ],
  activity: [
    {
      id: "op-1",
      source: "BROKERAGE_OPERATION",
      kind: "BUY",
      postedAt: day(2),
      title: "Buy 5 VWCE",
      detail: "5 × 112.10",
      amount: -560.5,
      currency: "USD",
      notes: null,
      assetId: "as-vwce",
      assetName: "Vanguard FTSE All-World",
      quantity: 5,
      unitPrice: 112.1,
      feeAmount: 1.5,
      transactionId: null,
    },
    {
      id: "op-2",
      source: "BROKERAGE_OPERATION",
      kind: "DIVIDEND",
      postedAt: day(5),
      title: "Dividend",
      detail: "VWCE distribution",
      amount: 38.2,
      currency: "USD",
      notes: null,
      assetId: "as-vwce",
      assetName: "Vanguard FTSE All-World",
      quantity: null,
      unitPrice: null,
      feeAmount: null,
      transactionId: null,
    },
    {
      id: "op-3",
      source: "TRANSACTION",
      kind: "TRANSFER_IN",
      postedAt: day(1),
      title: "Cash deposit",
      detail: "From Main current",
      amount: 1000,
      currency: "USD",
      notes: null,
      assetId: null,
      assetName: null,
      quantity: null,
      unitPrice: null,
      feeAmount: null,
      transactionId: "tx-broker-1",
    },
  ],
  allocation: {
    assetKindTargets: [
      {
        key: "STOCK",
        label: "Stocks",
        kind: "STOCK",
        ticker: null,
        exchange: null,
        currentValue: 13488,
        currentPercent: 84.9,
        targetPercent: 80,
        deltaPercent: 4.9,
        deltaValue: 778,
      },
      {
        key: "BOND",
        label: "Bonds",
        kind: "BOND",
        ticker: null,
        exchange: null,
        currentValue: 1162.5,
        currentPercent: 7.3,
        targetPercent: 20,
        deltaPercent: -12.7,
        deltaValue: -2015,
      },
    ],
    securityTargets: [],
  },
};

const routes = {
  "/health": {
    status: "ok",
    service: "api",
    authMode: "local",
    timestamp: new Date().toISOString(),
  },
  "/dashboard": dashboard,
  "/dashboard/page-data": { dashboard, budgetView: budgets, accounts, setup },
  "/dashboard/support-data": { budgetView: budgets, setup },
  "/setup/status": setup,
  "/accounts": accounts,
  "/accounts/page-data": { accounts, reconciliations },
  "/accounts/reconciliation": reconciliations,
  "/categories": categories,
  "/transactions": transactions,
  "/transactions/page-data": {
    transactions,
    cashflow: cashflowSummary,
    accounts,
    categories,
    expenseValidationRules: [],
  },
  "/cashflow/summary": cashflowSummary,
  "/cashflow/page-data": { analytics, accounts, categories, setup },
  "/cashflow/analytics": analytics,
  "/budgets": budgets,
  "/assets": dashboardAssets,
  "/assets/with-values": dashboardAssets,
  "/recurring-rules": recurringRules,
  "/recurring-rules/has-pending": { hasPending: true },
  "/monthly-review/page-data": { review, setup, hasPendingSync: true },
  "/snapshots": snapshots,
  "/brokerage": [brokerSummary],
  "/users/me/settings": {
    showTransactionTimes: true,
    startPage: "DASHBOARD",
    reportingCurrency: "EUR",
  },
  "/expense-validation": [
    {
      id: "evr-1",
      entry: "Esselunga",
      normalizedEntry: "esselunga",
      secondaryCategoryId: "cat-groceries",
      secondaryCategoryName: "Groceries",
      primaryCategoryId: "cat-living",
      primaryCategoryName: "Living",
      ...base,
    },
  ],
};

const dynamicRoutes = [
  [/^\/accounts\/([\w-]+)$/, (id) => accounts.find((a) => a.id === id)],
  [/^\/transactions\/([\w-]+)$/, (id) => transactions.find((t) => t.id === id)],
  [/^\/assets\/([\w-]+)$/, (id) => dashboardAssets.find((a) => a.id === id)],
  [/^\/recurring-rules\/([\w-]+)\/occurrences$/, () => []],
  [
    /^\/recurring-rules\/([\w-]+)$/,
    (id) => recurringRules.find((r) => r.id === id),
  ],
  [/^\/budgets\/([\w-]+)\/overrides$/, () => []],
  [/^\/brokerage\/([\w-]+)$/, () => workspace],
];

/**
 * With --hosted the mock impersonates a hosted finhance WEB deployment
 * instead of a bare API: data lives under /api/proxy/* behind a bearer
 * token, and /api/mobile/* simulates the sign-in handoff.
 */
const hostedMode = process.argv.includes("--hosted");
const MOCK_MOBILE_TOKEN = "mock-mobile-token";

function resolvePayload(path, method) {
  let payload = routes[path];

  if (payload === undefined) {
    for (const [pattern, resolve] of dynamicRoutes) {
      const match = path.match(pattern);
      if (match) {
        payload = resolve(match[1]);
        break;
      }
    }
  }

  if (payload === undefined && method !== "GET") {
    // Pretend mutations succeed by echoing something sensible.
    payload = { ok: true };
  }

  return payload;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = url.pathname.replace(/\/+$/, "") || "/";

  res.setHeader("Content-Type", "application/json");

  const respond = (status, payload) => {
    console.log(`${req.method} ${path} -> ${status}`);
    res.statusCode = status;
    res.end(JSON.stringify(payload));
  };

  if (hostedMode) {
    if (path === "/api/mobile/health") {
      return respond(200, {
        status: "ok",
        service: "finhance-web",
        authMode: "hosted",
        timestamp: new Date().toISOString(),
      });
    }

    if (path === "/api/mobile/authorize") {
      const redirect = url.searchParams.get("redirect") ?? "finhance://auth";
      res.statusCode = 302;
      res.setHeader("location", `${redirect}#token=${MOCK_MOBILE_TOKEN}`);
      console.log(`${req.method} ${path} -> 302 ${redirect}`);
      res.end();
      return;
    }

    if (!path.startsWith("/api/proxy")) {
      return respond(404, { message: `Mock route not found: ${path}` });
    }

    if (req.headers.authorization !== `Bearer ${MOCK_MOBILE_TOKEN}`) {
      return respond(401, { message: "Mobile session is invalid or expired." });
    }

    path = path.slice("/api/proxy".length) || "/";
  }

  const payload = resolvePayload(path, req.method);

  if (payload === undefined) {
    return respond(404, { message: `Mock route not found: ${path}` });
  }

  respond(200, payload);
});

server.listen(port, () => {
  console.log(
    `finhance mock ${hostedMode ? "hosted web" : "API"} listening on http://127.0.0.1:${port}`,
  );
});
