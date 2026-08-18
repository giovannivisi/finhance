import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.tsx", "lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "app/components/AccountDeletionDialog.tsx",
        "app/components/AccountsPageClient.tsx",
        "app/components/AnalyticsCategoryBarChart.tsx",
        "app/components/AssetForm.tsx",
        "app/components/AuthPageClient.tsx",
        "app/components/BrokeragePageClient.tsx",
        "app/components/BrokeragePerformanceChart.tsx",
        "app/components/BudgetsPageClient.tsx",
        "app/components/CategoriesPageClient.tsx",
        "app/components/DashboardClient.tsx",
        "app/components/DeleteAssetButton.tsx",
        "app/components/ExpenseValidationPageClient.tsx",
        "app/components/ImportsPageClient.tsx",
        "app/components/InvestmentPlansSection.tsx",
        "app/components/NavigationPrefetchCoordinator.tsx",
        "app/components/NavigationTransitionOverlay.tsx",
        "app/components/OverflowMenu.tsx",
        "app/components/ShellAccountMenu.tsx",
        "app/components/Sidebar.tsx",
        "app/components/TabBar.tsx",
        "app/components/TopHeader.tsx",
        "app/components/TransactionForm.tsx",
        "app/components/TransactionsPageClient.tsx",
        "app/components/UserSettingsPageClient.tsx",
      ],
      thresholds: {
        statements: 69,
        lines: 70,
        functions: 63,
        branches: 59,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
      "@components": path.resolve(__dirname, "./app/components"),
      "@lib": path.resolve(__dirname, "./lib"),
      "server-only": path.resolve(__dirname, "./test/server-only.ts"),
    },
  },
});
