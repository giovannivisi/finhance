import { useRouter } from "expo-router";
import { View } from "react-native";

import { AppText, Button, Card, Screen } from "@/components/ui";
import { spacing } from "@/theme";

export default function AccountDeletedScreen() {
  const router = useRouter();

  return (
    <Screen kicker="Account" title="Account deleted">
      <Card>
        <View style={{ gap: spacing.lg }}>
          <AppText variant="body" tone="secondary">
            Your hosted account and live workspace data have been deleted.
          </AppText>
          <Button
            label="Return to sign in"
            onPress={() => router.replace("/login")}
          />
        </View>
      </Card>
    </Screen>
  );
}
