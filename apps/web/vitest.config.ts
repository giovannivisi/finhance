import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: [
        "app/components/AccountsPageClient.tsx",
        "app/components/AssetForm.tsx",
        "app/components/TransactionForm.tsx",
        "app/components/BrokeragePageClient.tsx",
        "app/components/BudgetsPageClient.tsx",
        "app/components/DashboardClient.tsx",
        "app/components/OverflowMenu.tsx",
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
    },
  },
});
