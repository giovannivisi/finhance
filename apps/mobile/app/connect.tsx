import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
  const {
    serverUrl,
    needsSignIn,
    inspectServer,
    saveLocalServer,
    signInHosted,
  } = useServerConnection();

  const [url, setUrl] = useState("");
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A saved hosted server whose session expired jumps straight to sign-in.
  useEffect(() => {
    if (needsSignIn && serverUrl) {
      setUrl(serverUrl);
      setHostedUrl(serverUrl);
    }
  }, [needsSignIn, serverUrl]);

  const handleContinue = async () => {
    setBusy(true);
    setError(null);

    try {
      const inspection = await inspectServer(url);

      switch (inspection.kind) {
        case "local-api":
          await saveLocalServer(inspection.normalizedUrl);
          break;
        case "hosted-web":
          setHostedUrl(inspection.normalizedUrl);
          break;
        case "hosted-api":
          setError(
            "That is the API address. For hosted setups enter the web app address instead, e.g. https://finhance-web.vercel.app",
          );
          break;
        case "local-web":
          setError(
            "That is the local web app. Point the app directly at your self-hosted API (usually port 3000).",
          );
          break;
      }
    } catch (inspectError) {
      setError(describeError(inspectError));
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async () => {
    if (!hostedUrl) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await signInHosted(hostedUrl);
      // The connection gate flips to the tabs once the token is stored.
    } catch (signInError) {
      setError(describeError(signInError));
    } finally {
      setBusy(false);
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
              {hostedUrl ? "Sign in" : "Connect your server"}
            </AppText>
            <AppText
              variant="footnote"
              tone="secondary"
              style={{ textAlign: "center", maxWidth: 300 }}
            >
              {hostedUrl
                ? "Your browser opens for the usual sign-in. The app receives a private session for this device."
                : "Enter your hosted web address or a self-hosted API address."}
            </AppText>
          </View>
        </View>

        <Card>
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="Server URL"
              placeholder="https://finhance-web.vercel.app"
              value={url}
              onChangeText={(value) => {
                setUrl(value);
                setHostedUrl(null);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus={!needsSignIn}
              error={error}
              hint={
                hostedUrl
                  ? "Hosted finhance detected."
                  : "Hosted: the web app URL · Self-hosted: the API URL, e.g. http://192.168.1.10:3000"
              }
            />
            {hostedUrl ? (
              <Button
                label="Sign in with browser"
                onPress={handleSignIn}
                loading={busy}
                icon={
                  <Ionicons name="globe-outline" size={17} color="#ffffff" />
                }
              />
            ) : (
              <Button
                label="Continue"
                onPress={handleContinue}
                loading={busy}
                disabled={!url.trim()}
              />
            )}
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
              Hosted servers use your normal Google/GitHub sign-in; the session
              token stays in this device&apos;s keychain.
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
              name="home-outline"
              size={16}
              color={colors.textTertiary}
            />
            <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
              Self-hosted APIs in local mode connect directly — on a simulator
              use http://127.0.0.1:3000, on a phone your LAN address or a
              private tunnel such as Tailscale.
            </AppText>
          </View>
        </View>
      </View>
    </Screen>
  );
}
