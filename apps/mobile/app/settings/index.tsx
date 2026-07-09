import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { View } from "react-native";

import { AppText, Card, ListRow, Screen } from "@/components/ui";
import { useTheme } from "@/theme";

export default function SettingsHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen kicker="Preferences" title="Settings" showBack withTabBarClearance>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow
          title="App settings"
          subtitle="Appearance, formats, lock and launch"
          onPress={() => router.push("/settings/app" as Href)}
          showDivider
          left={
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.bgControl,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={17}
                color={colors.textSecondary}
              />
            </View>
          }
          right={
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textTertiary}
            />
          }
        />
        <ListRow
          title="User settings"
          subtitle="Account, passkeys and server"
          onPress={() => router.push("/settings/user" as Href)}
          left={
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.bgControl,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="person-circle-outline"
                size={18}
                color={colors.textSecondary}
              />
            </View>
          }
          right={
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textTertiary}
            />
          }
        />
      </Card>
      <AppText variant="footnote" tone="tertiary">
        Device-only choices stay on this phone. User settings sync through your
        finhance server.
      </AppText>
    </Screen>
  );
}
