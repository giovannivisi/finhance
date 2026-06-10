import { Screen, AppText } from "@/components/ui";

export default function DashboardScreen() {
  return (
    <Screen kicker="Overview" title="Dashboard" withTabBarClearance>
      <AppText tone="secondary">Coming together…</AppText>
    </Screen>
  );
}
