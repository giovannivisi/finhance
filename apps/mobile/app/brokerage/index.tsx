import { useRouter } from "expo-router";
import { View } from "react-native";

import { useBrokerageList } from "@/api/queries";
import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  MoneyText,
  Screen,
  SkeletonCard,
} from "@/components/ui";
import { spacing } from "@/theme";

export default function BrokerageListScreen() {
  const router = useRouter();
  const listQuery = useBrokerageList();
  const brokers = listQuery.data ?? [];

  return (
    <Screen
      kicker="Investments"
      title="Brokerage"
      showBack
      withTabBarClearance
      refreshing={listQuery.isRefetching}
      onRefresh={() => listQuery.refetch()}
    >
      {listQuery.isPending ? (
        <SkeletonCard lines={3} />
      ) : listQuery.isError ? (
        <ErrorState
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
        />
      ) : brokers.length === 0 ? (
        <EmptyState
          icon="trending-up-outline"
          title="No broker accounts"
          description="Create an account with type BROKER to unlock positions, operations, and allocation targets."
          actionLabel="Add a broker account"
          onAction={() => router.push("/accounts/upsert")}
        />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {brokers.map((broker, index) => (
            <ListRow
              key={broker.account.id}
              showDivider={index < brokers.length - 1}
              title={broker.account.name}
              subtitle={`${broker.activePositionCount} position${
                broker.activePositionCount === 1 ? "" : "s"
              } · ${broker.account.currency}`}
              onPress={() =>
                router.push({
                  pathname: "/brokerage/[accountId]",
                  params: { accountId: broker.account.id },
                })
              }
              right={
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <MoneyText
                    amount={broker.totalValue}
                    currency={broker.account.currency}
                    variant="bodyMedium"
                  />
                  <MoneyText
                    amount={broker.unrealisedGainLoss}
                    currency={broker.account.currency}
                    variant="caption"
                    colorBySign
                    signDisplay="exceptZero"
                    maximumFractionDigits={0}
                  />
                </View>
              }
            />
          ))}
        </Card>
      )}

      <AppText
        variant="caption"
        tone="tertiary"
        style={{ paddingHorizontal: spacing.sm }}
      >
        Cash moves in and out of brokers as transfers; trading history lives in
        each workspace.
      </AppText>
    </Screen>
  );
}
