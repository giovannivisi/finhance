import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type { CategoryResponse } from "@finhance/shared";

import { useCategories } from "@/api/queries";
import {
  AppText,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Screen,
  Section,
  SkeletonCard,
  SwitchField,
} from "@/components/ui";
import { spacing, useTheme } from "@/theme";

interface ExpenseGroup {
  primary: CategoryResponse;
  children: CategoryResponse[];
}

export default function CategoriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [includeArchived, setIncludeArchived] = useState(false);
  const categoriesQuery = useCategories(includeArchived);

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );

  const expenseGroups = useMemo<ExpenseGroup[]>(() => {
    const expenses = categories.filter(
      (category) => category.type === "EXPENSE",
    );
    const primaries = expenses
      .filter((category) => !category.parentCategoryId)
      .sort((left, right) => left.order - right.order);

    return primaries.map((primary) => ({
      primary,
      children: expenses
        .filter((category) => category.parentCategoryId === primary.id)
        .sort((left, right) => left.order - right.order),
    }));
  }, [categories]);

  const incomeCategories = useMemo(
    () =>
      categories
        .filter((category) => category.type === "INCOME")
        .sort((left, right) => left.order - right.order),
    [categories],
  );

  const openCategory = (id: string) =>
    router.push({ pathname: "/categories/upsert", params: { id } });

  return (
    <Screen
      kicker="Taxonomy"
      title="Categories"
      showBack
      withTabBarClearance
      refreshing={categoriesQuery.isRefetching}
      onRefresh={() => categoriesQuery.refetch()}
      headerRight={
        <IconButton
          accessibilityLabel="Add category"
          icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
          onPress={() => router.push("/categories/upsert")}
        />
      }
    >
      {categoriesQuery.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : categoriesQuery.isError ? (
        <ErrorState
          error={categoriesQuery.error}
          onRetry={() => categoriesQuery.refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No categories yet"
          description="Categories explain where money goes. Start with a few expense groups and an income source."
          actionLabel="Add a category"
          onAction={() => router.push("/categories/upsert")}
        />
      ) : (
        <>
          <Section
            kicker="Spending"
            title="Expense categories"
            description="Primary groups with their secondary categories."
          >
            <View style={{ gap: spacing.sm }}>
              {expenseGroups.map((group) => (
                <Card key={group.primary.id} style={{ paddingVertical: 4 }}>
                  <ListRow
                    title={group.primary.name}
                    subtitle={`${group.children.length} subcategor${
                      group.children.length === 1 ? "y" : "ies"
                    }`}
                    onPress={() => openCategory(group.primary.id)}
                    showDivider={group.children.length > 0}
                    right={
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {group.primary.archivedAt ? (
                          <Chip label="archived" tone="neutral" />
                        ) : null}
                        <Ionicons
                          name="chevron-forward"
                          size={15}
                          color={colors.textTertiary}
                        />
                      </View>
                    }
                  />
                  {group.children.map((child, index) => (
                    <ListRow
                      key={child.id}
                      title={child.name}
                      onPress={() => openCategory(child.id)}
                      showDivider={index < group.children.length - 1}
                      left={
                        <View style={{ width: 16, alignItems: "center" }}>
                          <View
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: colors.textTertiary,
                            }}
                          />
                        </View>
                      }
                      right={
                        child.archivedAt ? (
                          <Chip label="archived" tone="neutral" />
                        ) : undefined
                      }
                    />
                  ))}
                </Card>
              ))}
            </View>
          </Section>

          <Section kicker="Earning" title="Income categories">
            {incomeCategories.length === 0 ? (
              <Card surface="muted">
                <AppText variant="footnote" tone="secondary">
                  No income categories yet.
                </AppText>
              </Card>
            ) : (
              <Card style={{ paddingVertical: 4 }}>
                {incomeCategories.map((category, index) => (
                  <ListRow
                    key={category.id}
                    title={category.name}
                    onPress={() => openCategory(category.id)}
                    showDivider={index < incomeCategories.length - 1}
                    right={
                      category.archivedAt ? (
                        <Chip label="archived" tone="neutral" />
                      ) : undefined
                    }
                  />
                ))}
              </Card>
            )}
          </Section>

          <Card surface="muted">
            <SwitchField
              label="Show archived categories"
              value={includeArchived}
              onChange={setIncludeArchived}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
