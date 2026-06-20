import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";

import {
  useServerConnection,
  type HostedSignInProvider,
} from "@/api/server-connection";
import {
  AppText,
  Button,
  Card,
  describeError,
  Screen,
  TextField,
} from "@/components/ui";
import { PRODUCTION_SERVER_URL } from "@/lib/config";
import { spacing, useTheme } from "@/theme";

export type AuthMode = "login" | "signup";

interface AuthCopy {
  kicker: string;
  title: string;
  subtitle: string;
  googleLabel: string;
  githubLabel: string;
  switchPrompt: string;
  switchAction: string;
  switchTarget: "/login" | "/signup";
}

const COPY: Record<AuthMode, AuthCopy> = {
  login: {
    kicker: "Welcome back",
    title: "Log in",
    subtitle: "Continue to your hosted workspace.",
    googleLabel: "Log in with Google",
    githubLabel: "Log in with GitHub",
    switchPrompt: "New to finhance?",
    switchAction: "Create account",
    switchTarget: "/signup",
  },
  signup: {
    kicker: "Get started",
    title: "Create account",
    subtitle: "Start a private workspace with a verified provider account.",
    googleLabel: "Create with Google",
    githubLabel: "Create with GitHub",
    switchPrompt: "Already have an account?",
    switchAction: "Log in",
    switchTarget: "/login",
  },
};

/**
 * Shared hosted login / signup screen. Both routes render this with a different
 * `mode`: the only real differences are copy and the cross-link, because hosted
 * sign-in and sign-up share one browser OAuth handoff — whether a brand-new
 * provider account is allowed is decided server-side by `AUTH_SIGNUP_MODE`.
 *
 * Self-hosting stays available behind the "different server" disclosure.
 */
export default function AuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const {
    serverUrl,
    needsSignIn,
    inspectServer,
    saveLocalServer,
    signInHosted,
    signInWithPasskey,
    passkeysSupported,
  } = useServerConnection();

  const copy = COPY[mode];
  // A hosted session that expired is always a "sign in again", regardless of
  // which screen the gate happens to land on.
  const reauthenticating = mode === "login" && needsSignIn;

  const [advanced, setAdvanced] = useState(false);
  const [url, setUrl] = useState("");
  const [customHostedUrl, setCustomHostedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<HostedSignInProvider | null>(
    null,
  );
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const logoSource =
    scheme === "light"
      ? require("../../assets/icon.png")
      : require("../../assets/icon-dark.png");

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

  const handlePasskey = async (target: string) => {
    setPasskeyBusy(true);
    setBusy(true);
    setError(null);

    try {
      await signInWithPasskey(target);
      // The connection gate flips to the tabs once the token is stored.
    } catch (passkeyError) {
      setError(describeError(passkeyError));
    } finally {
      setPasskeyBusy(false);
      setBusy(false);
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

  const googleLabel = reauthenticating
    ? "Sign in again with Google"
    : copy.googleLabel;
  const githubLabel = reauthenticating
    ? "Sign in again with GitHub"
    : copy.githubLabel;

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
            <AppText variant="caption" tone="tertiary">
              {copy.kicker}
            </AppText>
            <AppText variant="display" style={{ textAlign: "center" }}>
              {copy.title}
            </AppText>
            <AppText
              variant="body"
              tone="secondary"
              style={{ textAlign: "center", maxWidth: 280 }}
            >
              {copy.subtitle}
            </AppText>
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          {!advanced ? (
            <>
              <Button
                label={googleLabel}
                onPress={() => handleSignIn(signInTarget, "google")}
                loading={busyProvider === "google"}
                disabled={busy}
                icon={<Ionicons name="logo-google" size={17} color="#ffffff" />}
              />
              <Button
                label={githubLabel}
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
              {mode === "login" && passkeysSupported ? (
                <Button
                  label="Sign in with a passkey"
                  onPress={() => handlePasskey(signInTarget)}
                  loading={passkeyBusy}
                  disabled={busy}
                  variant="secondary"
                  icon={
                    <Ionicons
                      name="finger-print"
                      size={17}
                      color={colors.textPrimary}
                    />
                  }
                />
              ) : null}
              <AppText
                variant="caption"
                tone="tertiary"
                style={{ textAlign: "center" }}
              >
                {mode === "login" && passkeysSupported
                  ? "Passkeys use Face ID or Touch ID. Google and GitHub open your browser."
                  : "Continue in your browser."}
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
                      label={copy.googleLabel}
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
                      label={copy.githubLabel}
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

          {!advanced ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(copy.switchTarget)}
              disabled={busy}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                  padding: spacing.sm,
                },
                pressed ? { opacity: 0.6 } : null,
              ]}
            >
              <AppText variant="footnote" tone="tertiary">
                {copy.switchPrompt}
              </AppText>
              <AppText variant="footnoteMedium" tone="accent">
                {copy.switchAction}
              </AppText>
            </Pressable>
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
