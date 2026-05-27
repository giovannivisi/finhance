import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AccountReconciliationResponse,
  AccountResponse,
} from "@finhance/shared";
import AccountsPageClient from "@components/AccountsPageClient";
import { apiMutation } from "@lib/api";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@components/Modal", () => ({
  default: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

vi.mock("@components/AccountForm", () => ({
  default: () => <div>Account form</div>,
}));

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
}));

const mockedApiMutation = vi.mocked(apiMutation);

function buildAccount(overrides: Partial<AccountResponse>): AccountResponse {
  return {
    id: overrides.id ?? "account-1",
    name: overrides.name ?? "Account",
    type: overrides.type ?? "BANK",
    currency: overrides.currency ?? "EUR",
    institution: overrides.institution ?? null,
    notes: overrides.notes ?? null,
    order: overrides.order ?? 0,
    openingBalance: overrides.openingBalance ?? 0,
    openingBalanceDate: overrides.openingBalanceDate ?? null,
    archivedAt: overrides.archivedAt ?? null,
    canDeletePermanently: overrides.canDeletePermanently ?? true,
    deleteBlockReason: overrides.deleteBlockReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-20T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-20T10:00:00.000Z",
  };
}

function buildReconciliation(
  overrides: Partial<AccountReconciliationResponse>,
): AccountReconciliationResponse {
  const accountType = overrides.accountType ?? "BANK";

  return {
    status: overrides.status ?? "CLEAN",
    accountId: overrides.accountId ?? "account-1",
    accountName: overrides.accountName ?? "Account",
    accountType,
    currency: overrides.currency ?? "EUR",
    reconciliationScope:
      overrides.reconciliationScope ??
      (accountType === "BROKER" ? "CASH_ONLY" : "FULL_BALANCE"),
    baselineMode: overrides.baselineMode ?? "FULL_HISTORY",
    trackedBalance: overrides.trackedBalance ?? 100,
    expectedBalance: overrides.expectedBalance ?? 100,
    delta: overrides.delta ?? 0,
    assetCount: overrides.assetCount ?? 1,
    transactionCount: overrides.transactionCount ?? 2,
    issueCodes: overrides.issueCodes ?? [],
    diagnostics: overrides.diagnostics ?? [],
    canCreateAdjustment: overrides.canCreateAdjustment ?? false,
    canEstablishOpeningBalanceBaseline:
      overrides.canEstablishOpeningBalanceBaseline ?? false,
    openingBalanceBaselineGuidance:
      overrides.openingBalanceBaselineGuidance ?? null,
    adjustmentGuidance: overrides.adjustmentGuidance ?? {
      status: "SAFE",
      message: "No action needed.",
    },
  };
}

const activeBroker = buildAccount({
  id: "broker-1",
  name: "Interactive Brokers",
  type: "BROKER",
  institution: "Interactive Brokers",
  notes: "Main broker",
});

const archivedLoan = buildAccount({
  id: "loan-1",
  name: "Mortgage",
  type: "LOAN",
  archivedAt: "2026-05-01T10:00:00.000Z",
  canDeletePermanently: true,
});

const reconciliations: AccountReconciliationResponse[] = [
  buildReconciliation({
    accountId: activeBroker.id,
    accountName: activeBroker.name,
    accountType: "BROKER",
    status: "MISMATCH",
    canCreateAdjustment: true,
    canEstablishOpeningBalanceBaseline: true,
    openingBalanceBaselineGuidance:
      "Current brokerage cash should become the new baseline.",
    diagnostics: [
      {
        code: "BASELINE_POSSIBLY_STALE",
        severity: "WARNING",
        summary: "Baseline may be stale.",
        likelyCause: "Imported opening balance is old.",
        recommendedAction: "Review and reset the baseline if required.",
      },
    ],
  }),
  buildReconciliation({
    accountId: archivedLoan.id,
    accountName: archivedLoan.name,
    accountType: "LOAN",
  }),
];

describe("AccountsPageClient", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    mockedApiMutation.mockReset();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  it("hides archived accounts by default and shows them when requested", async () => {
    const user = userEvent.setup();
    render(
      <AccountsPageClient
        accounts={[activeBroker, archivedLoan]}
        reconciliations={reconciliations}
      />,
    );

    expect(screen.getByText("Interactive Brokers")).toBeInTheDocument();
    expect(screen.queryByText("Mortgage")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/show archived/i));

    expect(screen.getByText("Mortgage")).toBeInTheDocument();
  });

  it("shows brokerage-only actions and wires reconciliation CTAs", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    render(
      <AccountsPageClient
        accounts={[activeBroker]}
        reconciliations={reconciliations.slice(0, 1)}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Open brokerage" }),
    ).toHaveAttribute("href", "/brokerage/broker-1");

    await user.click(screen.getByRole("button", { name: "More info" }));
    expect(
      screen.getByText(/brokerage reconciliation tracks cash movements only/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Set opening balance from current state",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Create adjustment" }));

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith(
        "/accounts/broker-1/opening-balance-baseline",
        { method: "POST" },
      );
      expect(mockedApiMutation).toHaveBeenCalledWith(
        "/accounts/broker-1/reconciliation/adjust",
        { method: "POST" },
      );
    });
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("archives, unarchives, and permanently deletes accounts", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    render(
      <AccountsPageClient
        accounts={[activeBroker, archivedLoan]}
        reconciliations={reconciliations}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByLabelText(/show archived/i));
    await user.click(screen.getByRole("button", { name: "Unarchive" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/accounts/broker-1", {
        method: "DELETE",
      });
      expect(mockedApiMutation).toHaveBeenCalledWith(
        "/accounts/loan-1/unarchive",
        { method: "POST" },
      );
      expect(mockedApiMutation).toHaveBeenCalledWith(
        "/accounts/loan-1/permanent",
        { method: "DELETE" },
      );
    });
    expect(globalThis.confirm).toHaveBeenCalledWith(
      "Delete this archived account permanently? This cannot be undone.",
    );
    expect(refreshMock).toHaveBeenCalledTimes(3);
  });
});
