import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, View } from "react-native";

import {
  AppText,
  Button,
  Card,
  describeError,
  Screen,
  TextField,
} from "@/components/ui";
import { useServerConnection } from "@/api/server-connection";
import { radius, spacing, useTheme } from "@/theme";

export default function ConnectScreen() {
  const { colors } = useTheme();
  const { saveServer } = useServerConnection();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleConnect = async () => {
    setSaving(true);
    setError(null);

    try {
      await saveServer(url);
      // The connection gate redirects to the tabs once the URL is stored.
    } catch (connectError) {
      setError(describeError(connectError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll contentStyle={{ justifyContent: "center", flexGrow: 1 }}>
      <View style={{ gap: spacing.xxl, paddingBottom: spacing.xxl }}>
        <View style={{ alignItems: "center", gap: spacing.lg }}>
          <Image
            source={require("../assets/splash-icon.png")}
            style={{
              width: 84,
              height: 84,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityLabel="finhance logo"
          />
          <View style={{ alignItems: "center", gap: 6 }}>
            <AppText variant="kicker" tone="accent">
              Welcome to finhance
            </AppText>
            <AppText variant="title1" style={{ textAlign: "center" }}>
              Connect your server
            </AppText>
            <AppText
              variant="footnote"
              tone="secondary"
              style={{ textAlign: "center", maxWidth: 300 }}
            >
              Point the app at your self-hosted finhance API. Your data stays on
              your server — the app talks to it directly.
            </AppText>
          </View>
        </View>

        <Card>
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="Server URL"
              placeholder="http://192.168.1.10:3000"
              value={url}
              onChangeText={(value) => {
                setUrl(value);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              error={error}
              hint="The API address, e.g. http://<your-machine>:3000 — not the web app URL."
            />
            <Button
              label="Test & connect"
              onPress={handleConnect}
              loading={saving}
              disabled={!url.trim()}
            />
          </View>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              alignItems: "center",
            }}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={colors.textTertiary}
            />
            <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
              Works with APIs running in local auth mode (the self-hosted
              default).
            </AppText>
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              alignItems: "center",
            }}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={16}
              color={colors.textTertiary}
            />
            <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
              On a simulator use http://127.0.0.1:3000 — on a phone use your
              machine&apos;s LAN address or a private tunnel such as Tailscale.
            </AppText>
          </View>
        </View>
      </View>
    </Screen>
  );
}
