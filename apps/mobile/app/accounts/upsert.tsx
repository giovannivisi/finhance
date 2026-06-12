import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { AccountType, UpsertAccountRequest } from "@finhance/shared";

import { api } from "@/api/endpoints";
import { useApiClient } from "@/api/server-connection";
import { useQuery } from "@tanstack/react-query";
import { useCreateAccount, useUpdateAccount } from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  DateField,
  describeError,
  ErrorState,
  LoadingState,
  Screen,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/ui";
import { todayLocalDate } from "@/lib/dates";
import { parseAmountInput } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { spacing } from "@/theme";

const TYPE_OPTIONS = (
  ["BANK", "BROKER", "CARD", "CASH", "LOAN", "OTHER"] as AccountType[]
).map((type) => ({
  value: type,
  label: ACCOUNT_TYPE_LABELS[type],
  detail:
    type === "BANK"
      ? "Current, savings, deposits"
      : type === "BROKER"
        ? "Investments with trading activity"
        : type === "CARD"
          ? "Credit and charge cards"
          : type === "CASH"
            ? "Physical wallets and envelopes"
            : type === "LOAN"
              ? "Mortgages and personal loans"
              : "Anything else",
}));

interface AccountFormState {
  name: string;
  type: AccountType;
  currency: string;
  institution: string;
  notes: string;
  hasOpeningBalance: boolean;
  openingBalance: string;
  openingBalanceDate: string;
}

export default function AccountUpsertScreen() {
  const router = useRouter();
  const client = useApiClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const accountId = params.id ?? null;
  const isEdit = Boolean(accountId);

  const accountQuery = useQuery({
    queryKey: ["accounts", "detail", accountId ?? "none"],
    queryFn: () => api.accounts.get(client, accountId ?? ""),
    enabled: isEdit,
  });

  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const [form, setForm] = useState<AccountFormState>({
    name: "",
    type: "BANK",
    currency: "EUR",
    institution: "",
    notes: "",
    hasOpeningBalance: false,
    openingBalance: "",
    openingBalanceDate: todayLocalDate(),
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isEdit && accountQuery.data && !hydrated) {
      const account = accountQuery.data;
      setForm({
        name: account.name,
        type: account.type,
        currency: account.currency,
        institution: account.institution ?? "",
        notes: account.notes ?? "",
        hasOpeningBalance: account.openingBalanceDate !== null,
        openingBalance: `${account.openingBalance}`,
        openingBalanceDate: account.openingBalanceDate
          ? account.openingBalanceDate.slice(0, 10)
          : todayLocalDate(),
      });
      setHydrated(true);
    }
  }, [isEdit, accountQuery.data, hydrated]);

  const update = (patch: Partial<AccountFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setServerError(null);
  };

  const handleSubmit = async () => {
    const nextErrors: Partial<Record<string, string>> = {};
    const name = form.name.trim();
    const currency = form.currency.trim().toUpperCase();

    if (!name) {
      nextErrors.name = "Give the account a name.";
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      nextErrors.currency = "Use a 3-letter code, e.g. EUR.";
    }

    let openingBalance: number | null = null;

    if (form.hasOpeningBalance) {
      openingBalance = parseAmountInput(form.openingBalance);

      if (openingBalance === null) {
        nextErrors.openingBalance = "Enter the starting balance.";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const body: UpsertAccountRequest = {
      name,
      type: form.type,
      currency,
      institution: form.institution.trim() || null,
      notes: form.notes.trim() || null,
      openingBalance: form.hasOpeningBalance ? openingBalance : null,
      openingBalanceDate: form.hasOpeningBalance
        ? form.openingBalanceDate
        : null,
    };

    try {
      if (isEdit && accountId) {
        await updateMutation.mutateAsync({ id: accountId, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      router.back();
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  if (isEdit && accountQuery.isPending) {
    return (
      <Screen title="Edit account" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (isEdit && accountQuery.isError) {
    return (
      <Screen title="Edit account" showBack>
        <ErrorState
          error={accountQuery.error}
          onRetry={() => accountQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen title={isEdit ? "Edit account" : "New account"} showBack>
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <TextField
          label="Name"
          value={form.name}
          onChangeText={(value) => update({ name: value })}
          placeholder="e.g. Main current account"
          error={errors.name}
          autoFocus={!isEdit}
        />
        <SelectField
          label="Type"
          options={TYPE_OPTIONS}
          value={form.type}
          onChange={(value) => update({ type: value })}
        />
        <TextField
          label="Currency"
          value={form.currency}
          onChangeText={(value) => update({ currency: value.toUpperCase() })}
          placeholder="EUR"
          autoCapitalize="characters"
          error={errors.currency}
          hint={
            isEdit
              ? "Changing currency on an account with history may be rejected."
              : "The native currency of this account."
          }
        />
        <TextField
          label="Institution (optional)"
          value={form.institution}
          onChangeText={(value) => update({ institution: value })}
          placeholder="e.g. Intesa Sanpaolo"
        />

        <Card surface="muted">
          <View style={{ gap: spacing.md }}>
            <SwitchField
              label="Opening balance baseline"
              description="Start reconciliation from a known balance on a given date."
              value={form.hasOpeningBalance}
              onChange={(value) => update({ hasOpeningBalance: value })}
            />
            {form.hasOpeningBalance ? (
              <>
                <AmountField
                  label="Balance"
                  value={form.openingBalance}
                  onChangeText={(value) => update({ openingBalance: value })}
                  currency={form.currency}
                  error={errors.openingBalance}
                />
                <DateField
                  label="As of"
                  value={form.openingBalanceDate}
                  onChange={(value) => update({ openingBalanceDate: value })}
                />
              </>
            ) : null}
          </View>
        </Card>

        <TextField
          label="Notes (optional)"
          value={form.notes}
          onChangeText={(value) => update({ notes: value })}
          multiline
        />

        {serverError ? (
          <Card surface="danger">
            <AppText variant="footnote" tone="danger">
              {serverError}
            </AppText>
          </Card>
        ) : null}

        <Button
          label={isEdit ? "Save changes" : "Create account"}
          onPress={handleSubmit}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      </View>
    </Screen>
  );
}
