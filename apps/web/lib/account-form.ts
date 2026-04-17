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
  };
}

export function buildAccountPayload(values: AccountFormValues): {
  payload?: UpsertAccountRequest;
  error?: string;
} {
  const name = values.name.trim();
  const currency = values.currency.trim().toUpperCase() || "EUR";
  const order = parseInteger(values.order);

  if (!name) {
    return { error: "Name is required." };
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code." };
  }

  return {
    payload: {
      name,
      type: values.type,
      currency,
      institution: values.institution.trim() || null,
      notes: values.notes.trim() || null,
      order,
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
