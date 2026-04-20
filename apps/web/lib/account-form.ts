import type {
  AccountResponse,
  AccountType,
  UpsertAccountRequest,
} from "@finhance/shared";

export interface AccountFormValues {
  name: string;
  type: AccountType;
  currency: string;
  institution: string;
  notes: string;
  order: string;
  openingBalance: string;
  openingBalanceDate: string;
}

const DEFAULT_ACCOUNT_TYPE: AccountType = "BANK";

export function createEmptyAccountFormValues(): AccountFormValues {
  return {
    name: "",
    type: DEFAULT_ACCOUNT_TYPE,
    currency: "EUR",
    institution: "",
    notes: "",
    order: "",
    openingBalance: "",
    openingBalanceDate: "",
  };
}

export function accountToFormValues(
  account: AccountResponse,
): AccountFormValues {
  return {
    name: account.name,
    type: account.type,
    currency: account.currency,
    institution: account.institution ?? "",
    notes: account.notes ?? "",
    order: String(account.order),
    openingBalance:
      account.openingBalance === 0 ? "" : String(account.openingBalance),
    openingBalanceDate: account.openingBalanceDate ?? "",
  };
}

export function buildAccountPayload(values: AccountFormValues): {
  payload?: UpsertAccountRequest;
  error?: string;
} {
  const name = values.name.trim();
  const currency = values.currency.trim().toUpperCase() || "EUR";
  const order = parseInteger(values.order);
  const openingBalance = parseDecimal(values.openingBalance);
  const openingBalanceDate = values.openingBalanceDate.trim() || null;

  if (!name) {
    return { error: "Name is required." };
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code." };
  }

  if (openingBalance === null) {
    return { error: "Opening balance must be a valid number." };
  }

  if (openingBalanceDate && !/^\d{4}-\d{2}-\d{2}$/.test(openingBalanceDate)) {
    return { error: "Opening balance date must use YYYY-MM-DD." };
  }

  if (openingBalance !== 0 && !openingBalanceDate) {
    return {
      error:
        "Opening balance date is required when opening balance is not zero.",
    };
  }

  return {
    payload: {
      name,
      type: values.type,
      currency,
      institution: values.institution.trim() || null,
      notes: values.notes.trim() || null,
      order,
      openingBalance,
      openingBalanceDate,
    },
  };
}

function parseInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseDecimal(value: string): number | null {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
