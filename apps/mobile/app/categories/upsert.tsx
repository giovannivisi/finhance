import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { CategoryType } from "@finhance/shared";

import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useDeleteCategoryPermanently,
  useUnarchiveCategory,
  useUpdateCategory,
} from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  describeError,
  Divider,
  ErrorState,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectField,
  Sheet,
  TextField,
} from "@/components/ui";
import { spacing } from "@/theme";

export default function CategoryUpsertScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const categoryId = params.id ?? null;
  const isEdit = Boolean(categoryId);

  const categoriesQuery = useCategories(true);
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const archiveMutation = useArchiveCategory();
  const unarchiveMutation = useUnarchiveCategory();
  const deleteMutation = useDeleteCategoryPermanently();

  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("EXPENSE");
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );
  const edited = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId],
  );

  useEffect(() => {
    if (isEdit && edited && !hydrated) {
      setName(edited.name);
      setType(edited.type);
      setParentId(edited.parentCategoryId);
      setHydrated(true);
    }
  }, [isEdit, edited, hydrated]);

  const primaryOptions = useMemo(
    () => [
      { value: "NONE", label: "None — this is a primary group" },
      ...categories
        .filter(
          (category) =>
            category.type === "EXPENSE" &&
            !category.parentCategoryId &&
            !category.archivedAt &&
            category.id !== categoryId,
        )
        .map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories, categoryId],
  );

  const submit = async () => {
    setError(null);

    if (!name.trim()) {
      setNameError("Give the category a name.");
      return;
    }

    setNameError(null);

    const body = {
      name: name.trim(),
      type,
      parentCategoryId: type === "EXPENSE" ? parentId : null,
    };

    try {
      if (isEdit && categoryId) {
        await updateMutation.mutateAsync({ id: categoryId, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      router.back();
    } catch (submitError) {
      setError(describeError(submitError));
    }
  };

  if (isEdit && categoriesQuery.isPending) {
    return (
      <Screen title="Edit category" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (isEdit && !categoriesQuery.isPending && !edited) {
    return (
      <Screen title="Edit category" showBack>
        <ErrorState
          error={categoriesQuery.error ?? new Error("Category not found.")}
          onRetry={() => categoriesQuery.refetch()}
        />
      </Screen>
    );
  }

  const isArchived = Boolean(edited?.archivedAt);

  return (
    <Screen title={isEdit ? "Edit category" : "New category"} showBack>
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder={type === "EXPENSE" ? "e.g. Groceries" : "e.g. Salary"}
          error={nameError}
          autoFocus={!isEdit}
        />

        {!isEdit ? (
          <SegmentedControl
            options={[
              { value: "EXPENSE", label: "Expense" },
              { value: "INCOME", label: "Income" },
            ]}
            value={type}
            onChange={(value) => {
              setType(value);
              setParentId(null);
            }}
          />
        ) : null}

        {type === "EXPENSE" ? (
          <SelectField
            label="Parent group"
            options={primaryOptions}
            value={parentId ?? "NONE"}
            onChange={(value) => setParentId(value === "NONE" ? null : value)}
            hint="Secondary categories receive transactions; primary groups organise them."
          />
        ) : null}

        {error ? (
          <Card surface="danger">
            <AppText variant="footnote" tone="danger">
              {error}
            </AppText>
          </Card>
        ) : null}

        <Button
          label={isEdit ? "Save changes" : "Create category"}
          onPress={submit}
          loading={createMutation.isPending || updateMutation.isPending}
        />

        {isEdit && edited ? (
          <>
            <Divider />
            <View style={{ gap: spacing.sm }}>
              {isArchived ? (
                <Button
                  label="Restore category"
                  variant="secondary"
                  loading={unarchiveMutation.isPending}
                  onPress={async () => {
                    try {
                      await unarchiveMutation.mutateAsync(edited.id);
                      router.back();
                    } catch (actionError) {
                      setError(describeError(actionError));
                    }
                  }}
                />
              ) : (
                <Button
                  label="Archive category"
                  variant="secondary"
                  loading={archiveMutation.isPending}
                  onPress={async () => {
                    try {
                      await archiveMutation.mutateAsync(edited.id);
                      router.back();
                    } catch (actionError) {
                      setError(describeError(actionError));
                    }
                  }}
                />
              )}
              {edited.canDeletePermanently ? (
                <Button
                  label="Delete permanently"
                  variant="danger"
                  onPress={() => setConfirmDelete(true)}
                />
              ) : edited.deleteBlockReason ? (
                <AppText variant="caption" tone="tertiary">
                  Permanent delete unavailable: {edited.deleteBlockReason}
                </AppText>
              ) : null}
            </View>
          </>
        ) : null}
      </View>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete category?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            “{name}” is removed for good. This is only possible while nothing
            references it.
          </AppText>
          <Button
            label="Delete forever"
            variant="danger"
            loading={deleteMutation.isPending}
            onPress={async () => {
              if (!categoryId) {
                return;
              }
              try {
                await deleteMutation.mutateAsync(categoryId);
                setConfirmDelete(false);
                router.back();
              } catch (actionError) {
                setConfirmDelete(false);
                setError(describeError(actionError));
              }
            }}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setConfirmDelete(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
