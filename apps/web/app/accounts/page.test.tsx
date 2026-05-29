import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountsPageDataResponse } from "@finhance/shared";
import AccountsPage from "@/accounts/page";

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock("@lib/server-api", () => ({
  api: apiMock,
}));

vi.mock("@components/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/AccountsPageClient", () => ({
  default: ({
    accounts,
    reconciliations,
  }: {
    accounts: AccountsPageDataResponse["accounts"];
    reconciliations: AccountsPageDataResponse["reconciliations"];
  }) => (
    <div>
      Accounts page client {accounts.length} / {reconciliations.length}
    </div>
  ),
}));

function buildAccountsPageData(): AccountsPageDataResponse {
  return {
    accounts: [
      {
        id: "account-1",
        name: "Checking",
        type: "BANK",
        currency: "EUR",
        institution: null,
        notes: null,
        order: 0,
        openingBalance: 0,
        openingBalanceDate: null,
        archivedAt: null,
        canDeletePermanently: false,
        deleteBlockReason: null,
        createdAt: "2026-05-01T10:00:00.000Z",
        updatedAt: "2026-05-01T10:00:00.000Z",
      },
    ],
    reconciliations: [
      {
        status: "CLEAN",
        accountId: "account-1",
        accountName: "Checking",
        accountType: "BANK",
        currency: "EUR",
        reconciliationScope: "FULL_BALANCE",
        baselineMode: "FULL_HISTORY",
        trackedBalance: 100,
        expectedBalance: 100,
        delta: 0,
        assetCount: 0,
        transactionCount: 2,
        issueCodes: [],
        diagnostics: [],
        canCreateAdjustment: false,
        canEstablishOpeningBalanceBaseline: false,
        openingBalanceBaselineGuidance: null,
        adjustmentGuidance: {
          status: "SAFE",
          message: "No adjustment needed.",
        },
      },
    ],
  };
}

describe("AccountsPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("renders the combined accounts page data from one route call", async () => {
    apiMock.mockResolvedValueOnce(buildAccountsPageData());

    render(await AccountsPage());

    expect(screen.getByText("Accounts page client 1 / 1")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(
      "/accounts/page-data?includeArchived=true",
    );
  });
});
