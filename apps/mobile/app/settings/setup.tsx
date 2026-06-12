import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { View } from "react-native";
import type { SetupHandoffCode, SetupStepCode } from "@finhance/shared";

import { useSetupStatus } from "@/api/queries";
import {
  AppText,
  Card,
  Chip,
  ErrorState,
  ListRow,
  ProgressBar,
  Screen,
  Section,
  SkeletonCard,
} from "@/components/ui";
import { spacing, useTheme } from "@/theme";

const STEP_ROUTES: Record<SetupStepCode, Href> = {
  ACCOUNTS: "/accounts",
  CATEGORIES: "/categories",
  REPORTING_CURRENCY: "/settings",
  RECURRING: "/recurring",
  BUDGETS: "/budgets",
};

const HANDOFF_ROUTES: Record<SetupHandoffCode, Href> = {
  REVIEW: "/review",
  ANALYTICS: "/analytics",
  BUDGETS: "/budgets",
  HISTORY: "/history",
};

export default function SetupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const setupQuery = useSetupStatus();
  const setup = setupQuery.data;

  return (
    <Screen
      kicker="Workspace health"
      title="Setup"
      showBack
      withTabBarClearance
      refreshing={setupQuery.isRefetching}
      onRefresh={() => setupQuery.refetch()}
    >
      {setupQuery.isPending ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </>
      ) : setupQuery.isError || !setup ? (
        <ErrorState
          error={setupQuery.error}
          onRetry={() => setupQuery.refetch()}
        />
      ) : (
        <>
          <Card surface={setup.isComplete ? "success" : "info"}>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="title3">
                {setup.isComplete
                  ? "Setup complete"
                  : `${setup.requiredCompletedCount} of ${setup.requiredTotalCount} required steps done`}
              </AppText>
              <ProgressBar
                ratio={
                  setup.requiredTotalCount > 0
                    ? setup.requiredCompletedCount / setup.requiredTotalCount
                    : 1
                }
                tone={setup.isComplete ? "accent" : "neutral"}
              />
            </View>
          </Card>

          <Section kicker="Required" title="Foundation steps">
            <Card style={{ paddingVertical: 4 }}>
              {setup.requiredSteps.map((step, index) => (
                <ListRow
                  key={step.code}
                  showDivider={index < setup.requiredSteps.length - 1}
                  title={step.title}
                  subtitle={step.detail}
                  titleLines={2}
                  onPress={() => router.push(STEP_ROUTES[step.code])}
                  left={
                    <Ionicons
                      name={
                        step.status === "COMPLETE"
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={20}
                      color={
                        step.status === "COMPLETE"
                          ? colors.primary
                          : colors.textTertiary
                      }
                    />
                  }
                  right={
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={colors.textTertiary}
                    />
                  }
                />
              ))}
            </Card>
          </Section>

          {setup.recommendedSteps.length > 0 ? (
            <Section kicker="Recommended" title="Next best moves">
              <Card style={{ paddingVertical: 4 }}>
                {setup.recommendedSteps.map((step, index) => (
                  <ListRow
                    key={step.code}
                    showDivider={index < setup.recommendedSteps.length - 1}
                    title={step.title}
                    subtitle={step.detail}
                    titleLines={2}
                    onPress={() => router.push(STEP_ROUTES[step.code])}
                    left={
                      <Ionicons
                        name={
                          step.status === "COMPLETE"
                            ? "checkmark-circle"
                            : "ellipse-outline"
                        }
                        size={20}
                        color={
                          step.status === "COMPLETE"
                            ? colors.primary
                            : colors.textTertiary
                        }
                      />
                    }
                  />
                ))}
              </Card>
            </Section>
          ) : null}

          {setup.warnings.length > 0 ? (
            <Section kicker="Trust" title="Reminders">
              <View style={{ gap: spacing.sm }}>
                {setup.warnings.map((warning) => (
                  <Card
                    key={warning.code}
                    surface={
                      warning.severity === "WARNING" ? "warning" : "info"
                    }
                  >
                    <View style={{ gap: 4 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: spacing.sm,
                        }}
                      >
                        <AppText variant="footnoteMedium" style={{ flex: 1 }}>
                          {warning.title}
                        </AppText>
                        {warning.count !== null ? (
                          <Chip label={`${warning.count}`} tone="neutral" />
                        ) : null}
                      </View>
                      <AppText variant="caption" tone="secondary">
                        {warning.detail}
                      </AppText>
                    </View>
                  </Card>
                ))}
              </View>
            </Section>
          ) : null}

          {setup.isComplete && setup.handoff.length > 0 ? (
            <Section kicker="Keep going" title="Where to next">
              <Card style={{ paddingVertical: 4 }}>
                {setup.handoff.map((handoff, index) => (
                  <ListRow
                    key={handoff.code}
                    showDivider={index < setup.handoff.length - 1}
                    title={handoff.title}
                    subtitle={handoff.detail}
                    titleLines={2}
                    onPress={() => router.push(HANDOFF_ROUTES[handoff.code])}
                    right={
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={colors.textTertiary}
                      />
                    }
                  />
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
