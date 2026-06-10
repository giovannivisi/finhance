import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type {
  AssetKind,
  AssetType,
  LiabilityKind,
  UpsertAssetRequest,
} from "@finhance/shared";

import { api } from "@/api/endpoints";
import { useApiClient } from "@/api/server-connection";
import { useQuery } from "@tanstack/react-query";
import {
  useAccountsList,
  useCreateAsset,
  useDeleteAsset,
  useUpdateAsset,
} from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  describeError,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectField,
  Sheet,
  TextField,
} from "@/components/ui";
import { parseAmountInput } from "@/lib/money";
import { ASSET_KIND_LABELS, LIABILITY_KIND_LABELS } from "@/lib/labels";
import { spacing, useTheme } from "@/theme";

const MARKET_KINDS: AssetKind[] = ["STOCK", "BOND", "CRYPTO", "COMMODITY"];

const ASSET_KIND_OPTIONS = (Object.keys(ASSET_KIND_LABELS) as AssetKind[]).map(
  (kind) => ({
    value: kind,
    label: ASSET_KIND_LABELS[kind],
    detail: MARKET_KINDS.includes(kind)
      ? "Quote-aware with ticker support"
      : "Manual valuation",
  }),
);

const LIABILITY_KIND_OPTIONS = (
  Object.keys(LIABILITY_KIND_LABELS) as LiabilityKind[]
).map((kind) => ({
  value: kind,
  label: LIABILITY_KIND_LABELS[kind],
}));

interface HoldingFormState {
  type: AssetType;
  name: string;
  kind: AssetKind;
  liabilityKind: LiabilityKind;
  accountId: string | null;
  currency: string;
  ticker: string;
  exchange: string;
  quantity: string;
  unitPrice: string;
  balance: string;
  notes: string;
}

export default function HoldingUpsertScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const assetId = params.id ?? null;
  const isEdit = Boolean(assetId);

  const assetQuery = useQuery({
    queryKey: ["assets", "detail", assetId ?? "none"],
    queryFn: () => api.assets.get(client, assetId ?? ""),
    enabled: isEdit,
  });
  const accountsQuery = useAccountsList(true);

  const createMutation = useCreateAsset();
  const updateMutation = useUpdateAsset();
  const deleteMutation = useDeleteAsset();

  const [form, setForm] = useState<HoldingFormState>({
    type: params.type === "LIABILITY" ? "LIABILITY" : "ASSET",
    name: "",
    kind: "CASH",
    liabilityKind: "DEBT",
    accountId: null,
    currency: "EUR",
    ticker: "",
    exchange: "",
    quantity: "",
    unitPrice: "",
    balance: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isEdit && assetQuery.data && !hydrated) {
      const asset = assetQuery.data;
      setForm({
        type: asset.type,
        name: asset.name,
        kind: asset.kind ?? "OTHER",
        liabilityKind: asset.liabilityKind ?? "OTHER",
        accountId: asset.accountId,
        currency: asset.currency,
        ticker: asset.ticker ?? "",
        exchange: asset.exchange ?? "",
        quantity: asset.quantity !== null ? `${asset.quantity}` : "",
        unitPrice: asset.unitPrice !== null ? `${asset.unitPrice}` : "",
        balance: `${asset.balance}`,
        notes: asset.notes ?? "",
      });
      setHydrated(true);
    }
  }, [isEdit, assetQuery.data, hydrated]);

  const update = (patch: Partial<HoldingFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setServerError(null);
  };

  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => !account.archivedAt || account.id === form.accountId,
      ),
    [accountsQuery.data, form.accountId],
  );

  const isAsset = form.type === "ASSET";
  const isMarket = isAsset && MARKET_KINDS.includes(form.kind);

  const handleSubmit = async () => {
    const nextErrors: Partial<Record<string, string>> = {};
    const name = form.name.trim();
    const currency = form.currency.trim().toUpperCase();

    if (!name) {
      nextErrors.name = "Give it a name.";
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      nextErrors.currency = "Use a 3-letter code.";
    }

    let quantity: number | null = null;
    let unitPrice: number | null = null;
    let balance: number | null = null;

    if (isMarket) {
      quantity = parseAmountInput(form.quantity);
      unitPrice = parseAmountInput(form.unitPrice);

      if (quantity === null || quantity <= 0) {
        nextErrors.quantity = "Enter the quantity held.";
      }

      if (unitPrice === null || unitPrice < 0) {
        nextErrors.unitPrice = "Enter the unit price.";
      }
    } else {
      balance = parseAmountInput(form.balance);

      if (balance === null) {
        nextErrors.balance = "Enter the current value.";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const body: UpsertAssetRequest = {
      name,
      type: form.type,
      currency,
      accountId: form.accountId,
      kind: isAsset ? form.kind : null,
      liabilityKind: isAsset ? null : form.liabilityKind,
      ticker: isMarket ? form.ticker.trim().toUpperCase() || null : null,
      exchange: isMarket ? form.exchange.trim() || null : null,
      quantity: isMarket ? quantity : null,
      unitPrice: isMarket ? unitPrice : null,
      balance: isMarket ? null : balance,
      notes: form.notes.trim() || null,
    };

    try {
      if (isEdit && assetId) {
        await updateMutation.mutateAsync({ id: assetId, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      router.back();
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  const handleDelete = async () => {
    if (!assetId) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(assetId);
      setConfirmDelete(false);
      router.back();
    } catch (error) {
      setConfirmDelete(false);
      setServerError(describeError(error));
    }
  };

  if (isEdit && assetQuery.isPending) {
    return (
      <Screen title="Edit holding" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (isEdit && assetQuery.isError) {
    return (
      <Screen title="Edit holding" showBack>
        <ErrorState
          error={assetQuery.error}
          onRetry={() => assetQuery.refetch()}
        />
      </Screen>
    );
  }

  const title = isEdit
    ? isAsset
      ? "Edit asset"
      : "Edit liability"
    : isAsset
      ? "New asset"
      : "New liability";

  return (
    <Screen
      title={title}
      showBack
      headerRight={
        isEdit ? (
          <IconButton
            accessibilityLabel="Delete holding"
            icon={
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            }
            onPress={() => setConfirmDelete(true)}
          />
        ) : undefined
      }
    >
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        {!isEdit ? (
          <SegmentedControl
            options={[
              { value: "ASSET", label: "Asset (you own)" },
              { value: "LIABILITY", label: "Liability (you owe)" },
            ]}
            value={form.type}
            onChange={(type) => update({ type })}
          />
        ) : null}

        <TextField
          label="Name"
          value={form.name}
          onChangeText={(value) => update({ name: value })}
          placeholder={
            isAsset ? "e.g. Emergency fund" : "e.g. Credit card balance"
          }
          error={errors.name}
          autoFocus={!isEdit}
        />

        {isAsset ? (
          <SelectField
            label="Kind"
            options={ASSET_KIND_OPTIONS}
            value={form.kind}
            onChange={(value) => update({ kind: value })}
          />
        ) : (
          <SelectField
            label="Kind"
            options={LIABILITY_KIND_OPTIONS}
            value={form.liabilityKind}
            onChange={(value) => update({ liabilityKind: value })}
          />
        )}

        <SelectField
          label="Account (optional)"
          options={[
            { value: "NONE", label: "No account" },
            ...accounts.map((account) => ({
              value: account.id,
              label: account.name,
              detail: account.currency,
            })),
          ]}
          value={form.accountId ?? "NONE"}
          onChange={(value) =>
            update({ accountId: value === "NONE" ? null : value })
          }
          hint="Attach to a container account for reconciliation."
        />

        <TextField
          label="Currency"
          value={form.currency}
          onChangeText={(value) => update({ currency: value.toUpperCase() })}
          autoCapitalize="characters"
          placeholder="EUR"
          error={errors.currency}
        />

        {isMarket ? (
          <Card surface="muted">
            <View style={{ gap: spacing.md }}>
              <AppText variant="footnoteMedium" tone="secondary">
                Market position
              </AppText>
              <TextField
                label="Ticker (optional)"
                value={form.ticker}
                onChangeText={(value) =>
                  update({ ticker: value.toUpperCase() })
                }
                placeholder="e.g. VWCE"
                autoCapitalize="characters"
                hint="With a ticker, prices refresh from market quotes."
              />
              <TextField
                label="Exchange (optional)"
                value={form.exchange}
                onChangeText={(value) => update({ exchange: value })}
                placeholder="e.g. MIL"
              />
              <AmountField
                label="Quantity"
                value={form.quantity}
                onChangeText={(value) => update({ quantity: value })}
                error={errors.quantity}
              />
              <AmountField
                label="Unit price"
                value={form.unitPrice}
                onChangeText={(value) => update({ unitPrice: value })}
                currency={form.currency}
                error={errors.unitPrice}
              />
            </View>
          </Card>
        ) : (
          <AmountField
            label={isAsset ? "Current value" : "Amount owed"}
            value={form.balance}
            onChangeText={(value) => update({ balance: value })}
            currency={form.currency}
            error={errors.balance}
          />
        )}

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
          label={
            isEdit ? "Save changes" : isAsset ? "Add asset" : "Add liability"
          }
          onPress={handleSubmit}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      </View>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={isAsset ? "Delete asset?" : "Delete liability?"}
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            “{form.name}” is removed from your net worth. Past snapshots keep
            their captured totals.
          </AppText>
          <Button
            label="Delete"
            variant="danger"
            onPress={handleDelete}
            loading={deleteMutation.isPending}
          />
          <Button
            label="Keep it"
            variant="secondary"
            onPress={() => setConfirmDelete(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
