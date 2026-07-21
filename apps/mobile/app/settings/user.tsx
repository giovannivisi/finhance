import { Ionicons } from "@expo/vector-icons";
import type {
  ConnectedAccountProvider,
  ConnectedAccountResponse,
} from "@finhance/shared/users";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Image, View } from "react-native";

import {
  useDeleteMobileConnectedAccount,
  useDeleteMobileAccount,
  useDeleteMobilePasskey,
  useLinkMobileConnectedAccount,
  useMobileAccount,
  useMobilePasskeys,
  useRegisterMobilePasskey,
} from "@/api/queries";
import { useServerConnection } from "@/api/server-connection";
import {
  formatPasskeyTitle,
  getMobileAccount,
  isRecentAuthError,
} from "@/api/passkeys";
import { createApiClient } from "@/api/client";
import {
  AppText,
  Button,
  Card,
  Chip,
  describeError,
  ErrorState,
  ListRow,
  Screen,
  Section,
  Sheet,
  SkeletonCard,
  TextField,
} from "@/components/ui";
import { localDateOf } from "@/lib/dates";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

type DeletionStep = "warning" | "confirmation";
type RecentAction =
  | { type: "add-passkey" }
  | { type: "delete-passkey"; credentialId: string }
  | { type: "connect-provider"; provider: ConnectedAccountProvider }
  | { type: "delete-connected-account"; accountId: string }
  | { type: "delete-account"; email: string };

function getIdentityInitials(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const source = input.name?.trim() || input.email?.trim() || "FW";
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    (parts[0]?.[0] ?? "F") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "W")
  ).toUpperCase();
}

export default function UserSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const format = useFormatters();
  const {
    serverUrl,
    serverMode,
    token,
    refreshHostedAccessToken,
    passkeysSupported,
    clearServer,
    signInHosted,
    signInWithPasskey,
    adoptHostedSession,
  } = useServerConnection();
  const accountQuery = useMobileAccount();
  const passkeysQuery = useMobilePasskeys();
  const registerPasskey = useRegisterMobilePasskey();
  const deletePasskey = useDeleteMobilePasskey();
  const linkConnectedAccount = useLinkMobileConnectedAccount();
  const deleteConnectedAccount = useDeleteMobileConnectedAccount();
  const deleteAccount = useDeleteMobileAccount();
  const [error, setError] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [connectedAccountError, setConnectedAccountError] = useState<
    string | null
  >(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmMobileSignOut, setConfirmMobileSignOut] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(
    null,
  );
  const [linkingProvider, setLinkingProvider] =
    useState<ConnectedAccountProvider | null>(null);
  const [deletingConnectedAccountId, setDeletingConnectedAccountId] = useState<
    string | null
  >(null);
  const [connectedAccountToRemove, setConnectedAccountToRemove] =
    useState<ConnectedAccountResponse | null>(null);
  const [isSigningOutMobileDevices, setIsSigningOutMobileDevices] =
    useState(false);
  const [recentAction, setRecentAction] = useState<RecentAction | null>(null);
  const [recentAuthError, setRecentAuthError] = useState<string | null>(null);
  const [recentAuthBusy, setRecentAuthBusy] = useState(false);
  const [deletionStep, setDeletionStep] = useState<DeletionStep>("warning");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  const accountEmail = accountQuery.data?.email ?? null;
  const accountName = accountQuery.data?.name?.trim() || null;
  const accountImage = accountQuery.data?.image ?? null;
  const connectedAccounts = accountQuery.data?.connectedAccounts ?? [];
  const connectedGoogle = connectedAccounts.some(
    (account) => account.provider === "google",
  );
  const connectedGitHub = connectedAccounts.some(
    (account) => account.provider === "github",
  );
  const hasAlternativeSignInMethod =
    connectedAccounts.length > 1 ||
    (!passkeysQuery.isPending &&
      !passkeysQuery.isError &&
      (passkeysQuery.data?.length ?? 0) > 0);
  const mustKeepCurrentConnectedAccount =
    connectedAccounts.length === 1 &&
    !passkeysQuery.isPending &&
    !passkeysQuery.isError &&
    (passkeysQuery.data?.length ?? 0) === 0;

  const closeAccountDeletion = () => {
    if (!deleteAccount.isPending) {
      setDeleteAccountOpen(false);
      setDeletionStep("warning");
      setConfirmationEmail("");
    }
  };

  const signOutMobileDevices = async () => {
    if (!serverUrl || serverMode !== "hosted" || !token) {
      return;
    }

    setError(null);
    setIsSigningOutMobileDevices(true);

    try {
      await createApiClient(serverUrl, {
        authToken: token,
        onUnauthorized: refreshHostedAccessToken,
      }).request("/api/mobile/sessions", { method: "DELETE" });

      setConfirmMobileSignOut(false);
      await clearServer({ serverSessionRevoked: true });
      router.replace("/login");
    } catch (signOutError) {
      setConfirmMobileSignOut(false);
      setError(describeError(signOutError));
    } finally {
      setIsSigningOutMobileDevices(false);
    }
  };

  const promptRecentAuth = (action: RecentAction) => {
    setRecentAuthError(null);
    if (action.type === "delete-account") {
      setDeleteAccountOpen(false);
    }
    if (action.type === "delete-connected-account") {
      setConnectedAccountToRemove(null);
    }
    setRecentAction(action);
  };

  const addPasskey = async (tokenOverride?: string) => {
    setPasskeyError(null);

    try {
      await registerPasskey.mutateAsync({ tokenOverride });
    } catch (addError) {
      if (isRecentAuthError(addError)) {
        promptRecentAuth({ type: "add-passkey" });
        return;
      }

      setPasskeyError(describeError(addError));
    }
  };

  const removePasskey = async (
    credentialId: string,
    tokenOverride?: string,
  ) => {
    setPasskeyError(null);
    setDeletingPasskeyId(credentialId);

    try {
      await deletePasskey.mutateAsync({ credentialId, tokenOverride });
    } catch (deleteError) {
      if (isRecentAuthError(deleteError)) {
        promptRecentAuth({ type: "delete-passkey", credentialId });
        return;
      }

      setPasskeyError(describeError(deleteError));
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  const connectProvider = async (
    provider: ConnectedAccountProvider,
    tokenOverride?: string,
  ) => {
    setConnectedAccountError(null);
    setLinkingProvider(provider);

    try {
      await linkConnectedAccount.mutateAsync({ provider, tokenOverride });
    } catch (linkError) {
      if (isRecentAuthError(linkError)) {
        promptRecentAuth({ type: "connect-provider", provider });
        return;
      }

      setConnectedAccountError(describeError(linkError));
    } finally {
      setLinkingProvider(null);
    }
  };

  const removeConnectedAccount = async (
    accountId: string,
    tokenOverride?: string,
  ) => {
    setConnectedAccountError(null);
    setDeletingConnectedAccountId(accountId);

    try {
      await deleteConnectedAccount.mutateAsync({ accountId, tokenOverride });
      setConnectedAccountToRemove(null);
    } catch (removeError) {
      if (isRecentAuthError(removeError)) {
        promptRecentAuth({ type: "delete-connected-account", accountId });
        return;
      }

      setConnectedAccountError(describeError(removeError));
    } finally {
      setDeletingConnectedAccountId(null);
    }
  };

  const deleteHostedAccount = async (email: string, tokenOverride?: string) => {
    setError(null);

    try {
      await deleteAccount.mutateAsync({ email, tokenOverride });
      await clearServer();
      router.replace("/account-deleted" as Href);
    } catch (deleteError) {
      if (isRecentAuthError(deleteError)) {
        promptRecentAuth({ type: "delete-account", email });
        return;
      }

      setError(describeError(deleteError));
    }
  };

  const retryRecentAction = async (tokenOverride: string) => {
    if (!recentAction) {
      return;
    }

    if (recentAction.type === "add-passkey") {
      await addPasskey(tokenOverride);
    } else if (recentAction.type === "delete-passkey") {
      await removePasskey(recentAction.credentialId, tokenOverride);
    } else if (recentAction.type === "connect-provider") {
      await connectProvider(recentAction.provider, tokenOverride);
    } else if (recentAction.type === "delete-connected-account") {
      await removeConnectedAccount(recentAction.accountId, tokenOverride);
    } else {
      await deleteHostedAccount(recentAction.email, tokenOverride);
    }
  };

  const confirmRecentAuth = async (method: "passkey" | "browser") => {
    if (!serverUrl || !recentAction) {
      return;
    }

    setRecentAuthBusy(true);
    setRecentAuthError(null);

    try {
      // Run the ceremony without rebinding the app session yet: a usernameless
      // passkey sheet or a browser sign-in can authenticate a different
      // account, and destructive actions must stay pinned to the current one.
      const freshSession =
        method === "passkey"
          ? await signInWithPasskey(serverUrl, { adoptSession: false })
          : await signInHosted(serverUrl, undefined, { adoptSession: false });

      const currentEmail =
        accountEmail ??
        (token
          ? (await getMobileAccount(serverUrl, token, refreshHostedAccessToken))
              .email
          : null);
      const freshEmail = (await getMobileAccount(serverUrl, freshSession.token))
        .email;

      if (!currentEmail || !freshEmail || currentEmail !== freshEmail) {
        setRecentAuthError(
          currentEmail
            ? `You confirmed with a different account. Sign in as ${currentEmail} and try again.`
            : "Your current account could not be verified. Try again.",
        );
        return;
      }

      await adoptHostedSession(serverUrl, freshSession);

      setRecentAction(null);
      await retryRecentAction(freshSession.token);
    } catch (authError) {
      setRecentAuthError(describeError(authError));
    } finally {
      setRecentAuthBusy(false);
    }
  };

  const renderPasskeys = () => {
    if (!passkeysSupported) {
      return (
        <AppText variant="footnote" tone="secondary">
          This device does not support passkeys.
        </AppText>
      );
    }

    if (passkeysQuery.isPending) {
      return <SkeletonCard lines={3} />;
    }

    if (passkeysQuery.isError) {
      return (
        <ErrorState
          error={passkeysQuery.error}
          onRetry={() => passkeysQuery.refetch()}
        />
      );
    }

    const passkeys = passkeysQuery.data ?? [];

    return (
      <Card style={{ paddingVertical: 4 }}>
        {passkeys.length === 0 ? (
          <View style={{ paddingVertical: spacing.md }}>
            <AppText variant="footnote" tone="secondary">
              No passkeys yet.
            </AppText>
          </View>
        ) : (
          passkeys.map((passkey, index) => (
            <ListRow
              key={passkey.credentialId}
              title={formatPasskeyTitle(passkey)}
              subtitle={`Added ${format.date(localDateOf(passkey.createdAt))}${
                passkey.lastUsedAt
                  ? ` · Last used ${format.date(
                      localDateOf(passkey.lastUsedAt),
                    )}`
                  : ""
              }`}
              showDivider={index < passkeys.length - 1}
              left={
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.bgControl,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons
                    name="key-outline"
                    size={16}
                    color={colors.textSecondary}
                  />
                </View>
              }
              right={
                <Button
                  label="Remove"
                  variant="secondary"
                  size="sm"
                  loading={deletingPasskeyId === passkey.credentialId}
                  onPress={() => void removePasskey(passkey.credentialId)}
                />
              }
            />
          ))
        )}
      </Card>
    );
  };

  const renderConnectedAccounts = () => {
    if (accountQuery.isPending) {
      return <SkeletonCard lines={3} />;
    }

    if (accountQuery.isError) {
      return (
        <ErrorState
          error={accountQuery.error}
          onRetry={() => accountQuery.refetch()}
        />
      );
    }

    return (
      <Card style={{ paddingVertical: 4 }}>
        {connectedAccounts.length === 0 ? (
          <View style={{ paddingVertical: spacing.md }}>
            <AppText variant="footnote" tone="secondary">
              No connected providers yet.
            </AppText>
          </View>
        ) : (
          connectedAccounts.map((account, index) => {
            const details = [
              account.providerEmail
                ? `${account.providerEmail}${
                    account.providerEmailVerified ? " · Verified" : ""
                  }`
                : "Provider email unavailable",
              account.isPrimaryEmail ? "Primary email" : null,
              account.createdAt
                ? `Added ${format.date(localDateOf(account.createdAt))}`
                : null,
            ].filter(Boolean);

            return (
              <ListRow
                key={account.id}
                title={
                  account.providerDisplayName
                    ? `${account.providerLabel} · ${account.providerDisplayName}`
                    : account.providerLabel
                }
                subtitle={details.join(" · ")}
                showDivider={index < connectedAccounts.length - 1}
                left={
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.bgControl,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={
                        account.provider === "google"
                          ? "logo-google"
                          : "logo-github"
                      }
                      size={16}
                      color={colors.textSecondary}
                    />
                  </View>
                }
                right={
                  <Button
                    label="Remove"
                    variant="secondary"
                    size="sm"
                    loading={deletingConnectedAccountId === account.id}
                    disabled={
                      !hasAlternativeSignInMethod ||
                      linkingProvider !== null ||
                      deletingConnectedAccountId !== null ||
                      recentAuthBusy
                    }
                    onPress={() => {
                      setConnectedAccountError(null);
                      setConnectedAccountToRemove(account);
                    }}
                  />
                }
              />
            );
          })
        )}
      </Card>
    );
  };

  return (
    <Screen kicker="Account" title="User settings" showBack withTabBarClearance>
      <Section kicker="Identity" title="Account">
        {serverMode === "hosted" && accountQuery.isPending ? (
          <SkeletonCard lines={3} />
        ) : (
          <Card>
            <View style={{ gap: spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                }}
              >
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 27,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    backgroundColor: colors.bgControl,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                  }}
                >
                  {accountImage ? (
                    <Image
                      source={{ uri: accountImage }}
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <AppText variant="bodySemibold">
                      {serverMode === "hosted"
                        ? getIdentityInitials({
                            name: accountName,
                            email: accountEmail,
                          })
                        : "SH"}
                    </AppText>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText variant="caption" tone="tertiary">
                    {serverMode === "hosted"
                      ? "HOSTED ACCOUNT"
                      : "SELF-HOSTED SERVER"}
                  </AppText>
                  <AppText variant="bodySemibold" numberOfLines={1}>
                    {serverMode === "hosted"
                      ? (accountName ?? accountEmail ?? "Hosted account")
                      : "Local auth mode"}
                  </AppText>
                  <AppText
                    variant="footnote"
                    tone="secondary"
                    numberOfLines={1}
                  >
                    {serverMode === "hosted"
                      ? (accountEmail ?? "Account email unavailable")
                      : "Identity is managed by the connected server."}
                  </AppText>
                </View>
              </View>

              {serverMode === "hosted" ? (
                <View style={{ gap: spacing.sm }}>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: spacing.sm,
                    }}
                  >
                    {connectedAccounts.length > 0 ? (
                      connectedAccounts.map((account) => (
                        <Chip
                          key={account.id}
                          label={account.providerLabel}
                          tone={account.isPrimaryEmail ? "success" : "neutral"}
                        />
                      ))
                    ) : (
                      <Chip label="No providers" tone="neutral" />
                    )}
                  </View>
                  <AppText variant="footnote" tone="secondary">
                    Add or remove sign-in methods below.
                  </AppText>
                </View>
              ) : null}
            </View>
          </Card>
        )}
      </Section>

      <Section kicker="Connection" title="Server">
        <Card>
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: 2 }}>
              <AppText variant="caption" tone="tertiary">
                CONNECTED TO
              </AppText>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {serverUrl || "—"}
              </AppText>
              <AppText variant="caption" tone="tertiary">
                {serverMode === "hosted"
                  ? "Hosted · signed in with your finhance account"
                  : "Self-hosted · local auth mode"}
              </AppText>
            </View>
            <Button
              label={serverMode === "hosted" ? "Sign out" : "Disconnect"}
              variant="danger"
              size="sm"
              onPress={() => setConfirmDisconnect(true)}
            />
          </View>
        </Card>
      </Section>

      {serverMode === "hosted" ? (
        <>
          <Section kicker="Security" title="Sign-in methods">
            <View style={{ gap: spacing.md }}>
              {renderConnectedAccounts()}
              {mustKeepCurrentConnectedAccount ? (
                <Card surface="warning">
                  <AppText variant="footnote" tone="secondary">
                    Keep at least one sign-in method so you do not lose access.
                    Add a passkey or connect GitHub before removing your only
                    connected provider.
                  </AppText>
                </Card>
              ) : null}
              {connectedAccountError ? (
                <Card surface="danger">
                  <AppText variant="footnote" tone="danger">
                    {connectedAccountError}
                  </AppText>
                </Card>
              ) : null}
              <View style={{ gap: spacing.sm }}>
                <Button
                  label={
                    connectedGoogle
                      ? "Connect another Google account"
                      : "Connect Google"
                  }
                  variant="secondary"
                  loading={linkingProvider === "google"}
                  disabled={
                    linkingProvider !== null ||
                    deletingConnectedAccountId !== null ||
                    recentAuthBusy
                  }
                  icon={
                    <Ionicons
                      name="logo-google"
                      size={17}
                      color={colors.textPrimary}
                    />
                  }
                  onPress={() => void connectProvider("google")}
                />
                <Button
                  label={
                    connectedGitHub
                      ? "Connect another GitHub account"
                      : "Connect GitHub"
                  }
                  variant="secondary"
                  loading={linkingProvider === "github"}
                  disabled={
                    linkingProvider !== null ||
                    deletingConnectedAccountId !== null ||
                    recentAuthBusy
                  }
                  icon={
                    <Ionicons
                      name="logo-github"
                      size={17}
                      color={colors.textPrimary}
                    />
                  }
                  onPress={() => void connectProvider("github")}
                />
              </View>
            </View>
          </Section>

          <Section kicker="Security" title="Passkeys">
            <View style={{ gap: spacing.md }}>
              {renderPasskeys()}
              {passkeyError ? (
                <Card surface="danger">
                  <AppText variant="footnote" tone="danger">
                    {passkeyError}
                  </AppText>
                </Card>
              ) : null}
              {passkeysSupported ? (
                <Button
                  label="Add passkey"
                  onPress={() => void addPasskey()}
                  loading={registerPasskey.isPending}
                />
              ) : null}
            </View>
          </Section>

          <Section kicker="Security" title="Mobile devices">
            <Card surface="warning">
              <View style={{ gap: spacing.md }}>
                <AppText variant="footnote" tone="secondary">
                  Sign out every mobile device connected to this hosted account.
                  This device will need to sign in again too.
                </AppText>
                <Button
                  label="Sign out mobile devices"
                  variant="danger"
                  size="sm"
                  onPress={() => setConfirmMobileSignOut(true)}
                />
              </View>
            </Card>
          </Section>

          <Section kicker="Danger zone" title="Delete account">
            <Card surface="danger">
              <View style={{ gap: spacing.md }}>
                <AppText variant="footnote" tone="secondary">
                  Permanently deletes your hosted account, passkeys, mobile
                  access and live workspace data.
                </AppText>
                <Button
                  label="Delete account"
                  variant="danger"
                  size="sm"
                  onPress={() => setDeleteAccountOpen(true)}
                />
              </View>
            </Card>
          </Section>
        </>
      ) : null}

      {error ? (
        <Card surface="danger">
          <AppText variant="footnote" tone="danger">
            {error}
          </AppText>
        </Card>
      ) : null}

      <Sheet
        visible={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect server?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            The app forgets this server and returns to the connect screen. No
            data on the server is touched.
          </AppText>
          <Button
            label="Disconnect"
            variant="danger"
            onPress={async () => {
              setConfirmDisconnect(false);
              await clearServer();
              router.replace("/login");
            }}
          />
          <Button
            label="Stay connected"
            variant="secondary"
            onPress={() => setConfirmDisconnect(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={confirmMobileSignOut}
        onClose={() => setConfirmMobileSignOut(false)}
        title="Sign out mobile devices?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            Every signed-in mobile device loses access immediately. You will
            return to the connect screen after this completes.
          </AppText>
          <Button
            label="Sign out devices"
            variant="danger"
            loading={isSigningOutMobileDevices}
            onPress={signOutMobileDevices}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setConfirmMobileSignOut(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={connectedAccountToRemove !== null}
        onClose={() => {
          if (!deletingConnectedAccountId) {
            setConnectedAccountToRemove(null);
            setConnectedAccountError(null);
          }
        }}
        title="Remove sign-in method?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            {connectedAccountToRemove
              ? `${connectedAccountToRemove.providerLabel} will no longer be able to sign in to this account.`
              : "This sign-in method will no longer be able to access this account."}
          </AppText>
          {connectedAccountError ? (
            <AppText variant="footnote" tone="danger">
              {connectedAccountError}
            </AppText>
          ) : null}
          <Button
            label="Remove method"
            variant="danger"
            loading={
              deletingConnectedAccountId === connectedAccountToRemove?.id
            }
            onPress={() => {
              if (connectedAccountToRemove) {
                void removeConnectedAccount(connectedAccountToRemove.id);
              }
            }}
          />
          <Button
            label="Cancel"
            variant="secondary"
            disabled={deletingConnectedAccountId !== null}
            onPress={() => {
              setConnectedAccountToRemove(null);
              setConnectedAccountError(null);
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={recentAction !== null}
        onClose={() => {
          if (!recentAuthBusy) {
            setRecentAction(null);
            setRecentAuthError(null);
          }
        }}
        title="Confirm it is you"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            Confirm your identity before changing sign-in methods or deleting
            your account. If the browser already has an active session, it may
            return to finhance immediately.
          </AppText>
          {recentAuthError ? (
            <AppText variant="footnote" tone="danger">
              {recentAuthError}
            </AppText>
          ) : null}
          {passkeysSupported ? (
            <Button
              label="Use passkey"
              loading={recentAuthBusy}
              onPress={() => void confirmRecentAuth("passkey")}
            />
          ) : null}
          <Button
            label="Confirm in browser"
            variant="secondary"
            loading={recentAuthBusy}
            onPress={() => void confirmRecentAuth("browser")}
          />
        </View>
      </Sheet>

      <Sheet
        visible={deleteAccountOpen}
        onClose={closeAccountDeletion}
        title="Delete your account?"
      >
        {deletionStep === "warning" ? (
          <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
            <AppText variant="footnote" tone="secondary">
              This permanently deletes transactions, accounts, assets,
              categories, budgets, brokerage data, imports, snapshots, passkeys,
              mobile sessions and the hosted user record.
            </AppText>
            <Button
              label="Continue to deletion"
              variant="danger"
              onPress={() => setDeletionStep("confirmation")}
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={closeAccountDeletion}
            />
          </View>
        ) : (
          <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
            <AppText variant="footnote" tone="secondary">
              To confirm, type {accountEmail ?? "your account email"} below.
            </AppText>
            {accountQuery.isPending ? (
              <SkeletonCard lines={1} />
            ) : accountQuery.isError || !accountEmail ? (
              <ErrorState
                error={accountQuery.error ?? new Error("Email unavailable.")}
                onRetry={() => accountQuery.refetch()}
              />
            ) : (
              <TextField
                label="Account email"
                value={confirmationEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setConfirmationEmail}
              />
            )}
            <Button
              label={
                deleteAccount.isPending
                  ? "Deleting account..."
                  : "Permanently delete account"
              }
              variant="danger"
              disabled={!accountEmail || confirmationEmail !== accountEmail}
              loading={deleteAccount.isPending}
              onPress={() => {
                if (accountEmail) {
                  void deleteHostedAccount(accountEmail);
                }
              }}
            />
            <Button
              label="Back"
              variant="secondary"
              disabled={deleteAccount.isPending}
              onPress={() => setDeletionStep("warning")}
            />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
