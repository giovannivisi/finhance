import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountResponse } from "@finhance/shared";
import AssetForm from "@components/AssetForm";
import {
  createEmptyAssetFormValues,
  type AssetFormValues,
} from "@lib/asset-form";
import { api, apiMutation } from "@lib/api";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("@lib/api", () => ({
  api: vi.fn(),
  apiMutation: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedApiMutation = vi.mocked(apiMutation);

const accounts: AccountResponse[] = [
  {
    id: "account-1",
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
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
  {
    id: "account-2",
    name: "Main bank",
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
];

function buildStockValues(): AssetFormValues {
  return {
    ...createEmptyAssetFormValues(),
    name: "VWCE",
    kind: "STOCK",
    ticker: "VWCE",
    exchange: ".MI",
    quantity: "2",
    unitPrice: "100",
    currency: "eur",
  };
}

describe("AssetForm", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    mockedApi.mockReset();
    mockedApiMutation.mockReset();
    mockedApi.mockResolvedValue(accounts);
  });

  it("switches between stock and liability field sets", async () => {
    const user = userEvent.setup();
    render(<AssetForm mode="create" initialValues={buildStockValues()} />);

    expect(await screen.findByLabelText("Ticker")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit Price")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type"), "LIABILITY");

    expect(screen.queryByLabelText("Ticker")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unit Price")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });

  it("filters exchange options by asset kind", async () => {
    const user = userEvent.setup();
    render(<AssetForm mode="create" initialValues={buildStockValues()} />);

    const exchange = await screen.findByLabelText(/Exchange/);
    await user.click(exchange);
    const listbox = screen.getByRole("listbox");
    expect(
      within(listbox).getByRole("option", { name: /Milan/i }),
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: /Crypto/i }),
    ).not.toBeInTheDocument();
    await user.click(exchange);

    await user.selectOptions(screen.getByLabelText("Kind"), "CRYPTO");

    expect(exchange).toHaveTextContent("Crypto");
    await user.click(exchange);
    const cryptoListbox = screen.getByRole("listbox");
    expect(
      within(cryptoListbox).getByRole("option", { name: /Crypto/i }),
    ).toBeInTheDocument();
    expect(
      within(cryptoListbox).queryByRole("option", { name: /Milan/i }),
    ).not.toBeInTheDocument();
  });

  it("only offers broker accounts for market assets", async () => {
    const user = userEvent.setup();
    render(<AssetForm mode="create" initialValues={buildStockValues()} />);

    const account = await screen.findByLabelText(/Account/);
    expect(
      within(account).getByRole("option", { name: "Broker (Broker)" }),
    ).toBeInTheDocument();
    expect(
      within(account).queryByRole("option", { name: "Main bank (Bank)" }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Kind"), "CASH");

    expect(
      within(account).getByRole("option", { name: "Main bank (Bank)" }),
    ).toBeInTheDocument();
  });

  it("shows an inline account-loading error", async () => {
    mockedApi.mockRejectedValueOnce(new Error("Unable to load accounts."));

    render(
      <AssetForm mode="create" initialValues={createEmptyAssetFormValues()} />,
    );

    expect(
      await screen.findByText("Unable to load accounts."),
    ).toBeInTheDocument();
  });

  it("submits create requests with the normalized asset payload", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    render(<AssetForm mode="create" initialValues={buildStockValues()} />);

    await screen.findByLabelText("Ticker");
    await user.click(screen.getByRole("button", { name: "Create Asset" }));

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/assets", {
        method: "POST",
        body: JSON.stringify({
          name: "VWCE",
          type: "ASSET",
          accountId: null,
          currency: "EUR",
          ticker: "VWCE",
          exchange: ".MI",
          quantity: 2,
          unitPrice: 100,
          balance: 200,
          kind: "STOCK",
          liabilityKind: null,
          notes: null,
          order: null,
        }),
      });
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("submits edit requests with the liability payload", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue(undefined);

    const initialValues: AssetFormValues = {
      ...createEmptyAssetFormValues(),
      name: "Mortgage",
      type: "LIABILITY",
      kind: "DEBT",
      balance: "150000",
      accountId: "account-1",
    };

    render(
      <AssetForm assetId="asset-1" mode="edit" initialValues={initialValues} />,
    );

    await screen.findByLabelText("Amount");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/assets/asset-1", {
        method: "PUT",
        body: JSON.stringify({
          name: "Mortgage",
          type: "LIABILITY",
          accountId: "account-1",
          currency: "EUR",
          ticker: null,
          exchange: null,
          quantity: null,
          unitPrice: null,
          balance: 150000,
          kind: null,
          liabilityKind: "DEBT",
          notes: null,
          order: null,
        }),
      });
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
