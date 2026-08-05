import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvestmentPlansSection from "@components/InvestmentPlansSection";
import { apiMutation } from "@lib/api";
import type {
  BrokerageAccountSummaryResponse,
  InvestmentPlanResponse,
} from "@finhance/shared";

const refreshMock = vi.fn();
const { apiMutationMock } = vi.hoisted(() => ({
  apiMutationMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@lib/api", () => ({
  apiMutation: apiMutationMock,
}));

vi.mock("@components/Modal", () => ({
  default: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

vi.mock("@components/MoneyValue", () => ({
  default: ({ value, currency }: { value: number; currency: string }) => (
    <span>
      {value} {currency}
    </span>
  ),
}));

vi.mock("@components/SearchablePicker", () => ({
  default: ({ id, value }: { id: string; value: string }) => (
    <button id={id} type="button">
      {value}
    </button>
  ),
}));

function buildAccount(): BrokerageAccountSummaryResponse {
  return {
    account: {
      id: "broker-1",
      name: "Broker",
      type: "BROKER",
      currency: "EUR",
      institution: null,
      notes: null,
      order: 0,
      openingBalance: 0,
      openingBalanceDate: null,
      archivedAt: null,
      canDeletePermanently: true,
      deleteBlockReason: null,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
    totalValue: 1_000,
    cashAvailable: 500,
    investedValue: 500,
    unrealisedGainLoss: 0,
    activePositionCount: 1,
  };
}

function buildPlan(
  overrides: Partial<InvestmentPlanResponse> = {},
): InvestmentPlanResponse {
  return {
    id: "plan-1",
    account: { id: "broker-1", name: "Broker", currency: "EUR" },
    name: "VWCE plan",
    securityName: "Vanguard FTSE All-World",
    securityKind: "STOCK",
    securityTicker: "VWCE",
    securityExchange: ".DE",
    currency: "EUR",
    contributionAmount: 250,
    estimatedFeeAmount: 1,
    cadence: "TWICE_MONTHLY",
    dayOfMonth: 1,
    secondDayOfMonth: 15,
    nextScheduledDate: "2026-08-01",
    isActive: true,
    isDue: true,
    notes: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("InvestmentPlansSection", () => {
  const onRecordBuy = vi.fn();

  beforeEach(() => {
    apiMutationMock.mockReset();
    apiMutationMock.mockResolvedValue({});
    refreshMock.mockReset();
    onRecordBuy.mockReset();
  });

  it("surfaces a due plan and sends it to the confirmed-buy workflow", async () => {
    const user = userEvent.setup();
    render(
      <InvestmentPlansSection
        plans={[buildPlan()]}
        accounts={[buildAccount()]}
        defaultAccountId="broker-1"
        onRecordBuy={onRecordBuy}
      />,
    );

    expect(screen.getByText("Due now")).toBeInTheDocument();
    expect(
      screen.getByText(/never create trades automatically/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record buy" }));

    expect(onRecordBuy).toHaveBeenCalledWith(buildPlan());
  });

  it("pauses a plan without creating a brokerage operation", async () => {
    const user = userEvent.setup();
    render(
      <InvestmentPlansSection
        plans={[buildPlan()]}
        accounts={[buildAccount()]}
        defaultAccountId="broker-1"
        onRecordBuy={onRecordBuy}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() =>
      expect(apiMutation).toHaveBeenCalledWith(
        "/investment-plans/plan-1/pause",
        {
          method: "POST",
        },
      ),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("creates a plan with an intended contribution and no buy operation", async () => {
    const user = userEvent.setup();
    render(
      <InvestmentPlansSection
        plans={[]}
        accounts={[buildAccount()]}
        defaultAccountId="broker-1"
        onRecordBuy={onRecordBuy}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.type(screen.getByLabelText("Plan name"), "VWCE savings");
    await user.type(
      screen.getByLabelText("Security name"),
      "Vanguard FTSE All-World",
    );
    await user.type(screen.getByLabelText("Ticker"), "VWCE");
    await user.type(screen.getByLabelText("Intended contribution"), "250");

    await user.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(apiMutation).toHaveBeenCalledTimes(1));
    const [url, options] = vi.mocked(apiMutation).mock.calls[0]!;
    expect(url).toBe("/investment-plans");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual(
      expect.objectContaining({
        accountId: "broker-1",
        name: "VWCE savings",
        securityTicker: "VWCE",
        contributionAmount: 250,
      }),
    );
    expect(onRecordBuy).not.toHaveBeenCalled();
  });
});
