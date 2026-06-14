import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";

import {
  AppText,
  Button,
  Card,
  describeError,
  Screen,
  TextField,
} from "@/components/ui";
import {
  useServerConnection,
  type HostedSignInProvider,
} from "@/api/server-connection";
import { PRODUCTION_SERVER_URL } from "@/lib/config";
import { spacing, useTheme } from "@/theme";

/**
 * Welcome / sign-in. The production deployment is baked in: open the app,
 * sign in once in the browser, done. Self-hosting stays available behind the
 * "different server" disclosure for those who want it.
 */
export default function ConnectScreen() {
  const { colors, scheme } = useTheme();
  const {
    serverUrl,
    needsSignIn,
    inspectServer,
    saveLocalServer,
    signInHosted,
  } = useServerConnection();

  const [advanced, setAdvanced] = useState(false);
  const [url, setUrl] = useState("");
  const [customHostedUrl, setCustomHostedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] =
    useState<HostedSignInProvider | null>(null);
  const logoSource =
    scheme === "light"
      ? require("../assets/icon.png")
      : require("../assets/icon-dark.png");

  // A saved hosted server whose session expired signs back into that server.
  const signInTarget =
    customHostedUrl ??
    (needsSignIn && serverUrl ? serverUrl : PRODUCTION_SERVER_URL);

  useEffect(() => {
    if (needsSignIn && serverUrl && serverUrl !== PRODUCTION_SERVER_URL) {
      setAdvanced(true);
      setUrl(serverUrl);
      setCustomHostedUrl(serverUrl);
    }
  }, [needsSignIn, serverUrl]);

  const handleSignIn = async (
    target: string,
    provider: HostedSignInProvider,
  ) => {
    setBusy(true);
    setBusyProvider(provider);
    setError(null);

    try {
      await signInHosted(target, provider);
      // The connection gate flips to the tabs once the token is stored.
    } catch (signInError) {
      setError(describeError(signInError));
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  const handleAdvancedContinue = async () => {
    setBusy(true);
    setError(null);

    try {
      const inspection = await inspectServer(url);

      switch (inspection.kind) {
        case "local-api":
          await saveLocalServer(inspection.normalizedUrl);
          break;
        case "hosted-web":
          setCustomHostedUrl(inspection.normalizedUrl);
          break;
        case "hosted-api":
          setError(
            "That is the API address — enter the web app address of the deployment instead.",
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

  return (
    <Screen scroll contentStyle={{ justifyContent: "center", flexGrow: 1 }}>
      <View style={{ gap: spacing.xxl, paddingBottom: spacing.xxl }}>
        <View style={{ alignItems: "center", gap: spacing.xl }}>
          <Image
            source={logoSource}
            style={{
              width: 96,
              height: 96,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.bgCardMuted,
            }}
            accessibilityLabel="finhance logo"
          />
          <View style={{ alignItems: "center", gap: 8 }}>
            <AppText variant="display" style={{ textAlign: "center" }}>
              finhance
            </AppText>
            <AppText
              variant="body"
              tone="secondary"
              style={{ textAlign: "center", maxWidth: 280 }}
            >
              Accounts, budgets, and net worth — explained, not just counted.
            </AppText>
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          {!advanced ? (
            <>
              <Button
                label={
                  needsSignIn
                    ? "Sign in again with Google"
                    : "Sign in with Google"
                }
                onPress={() => handleSignIn(signInTarget, "google")}
                loading={busyProvider === "google"}
                disabled={busy}
                icon={
                  <Ionicons name="logo-google" size={17} color="#ffffff" />
                }
              />
              <Button
                label={
                  needsSignIn
                    ? "Sign in again with GitHub"
                    : "Sign in with GitHub"
                }
                onPress={() => handleSignIn(signInTarget, "github")}
                loading={busyProvider === "github"}
                disabled={busy}
                variant="secondary"
                icon={
                  <Ionicons
                    name="logo-github"
                    size={17}
                    color={colors.textPrimary}
                  />
                }
              />
              <AppText
                variant="caption"
                tone="tertiary"
                style={{ textAlign: "center" }}
              >
                Continue in your browser.
              </AppText>
            </>
          ) : (
            <Card>
              <View style={{ gap: spacing.lg }}>
                <TextField
                  label="Server URL"
                  placeholder="https://your-deployment.example"
                  value={url}
                  onChangeText={(value) => {
                    setUrl(value);
                    setCustomHostedUrl(null);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  hint={
                    customHostedUrl
                      ? "Hosted finhance detected — continue with sign-in."
                      : "A hosted web URL, or a self-hosted API URL in local mode."
                  }
                />
                {customHostedUrl ? (
                  <View style={{ gap: spacing.md }}>
                    <Button
                      label="Sign in with Google"
                      onPress={() => handleSignIn(customHostedUrl, "google")}
                      loading={busyProvider === "google"}
                      disabled={busy}
                      icon={
                        <Ionicons
                          name="logo-google"
                          size={17}
                          color="#ffffff"
                        />
                      }
                    />
                    <Button
                      label="Sign in with GitHub"
                      onPress={() => handleSignIn(customHostedUrl, "github")}
                      loading={busyProvider === "github"}
                      disabled={busy}
                      variant="secondary"
                      icon={
                        <Ionicons
                          name="logo-github"
                          size={17}
                          color={colors.textPrimary}
                        />
                      }
                    />
                  </View>
                ) : (
                  <Button
                    label="Continue"
                    onPress={handleAdvancedContinue}
                    loading={busy}
                    disabled={!url.trim()}
                  />
                )}
              </View>
            </Card>
          )}

          {error ? (
            <Card surface="danger">
              <AppText variant="footnote" tone="danger">
                {error}
              </AppText>
            </Card>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAdvanced(!advanced);
              setError(null);
              setCustomHostedUrl(null);
            }}
            style={({ pressed }) => [
              { alignSelf: "center", padding: spacing.sm },
              pressed ? { opacity: 0.6 } : null,
            ]}
          >
            <AppText variant="footnoteMedium" tone="tertiary">
              {advanced ? "Back to regular sign-in" : "Use a different server"}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
