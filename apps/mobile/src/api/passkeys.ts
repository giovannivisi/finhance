import {
  type ConnectedAccountProvider,
  type ConfirmMobileProviderLinkResponse,
  RECENT_AUTH_REQUIRED_CODE,
  type DeleteConnectedAccountRequest,
  type DeleteUserAccountRequest,
  type DeleteUserPasskeyRequest,
  type StartMobileProviderLinkResponse,
  type UserIdentityResponse,
  type UserPasskeyResponse,
} from "@finhance/shared/users";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { create as passkeyCreate } from "react-native-passkeys";

import { parseMobileAuthCallback } from "@/lib/auth-callback";

import { ApiError, createApiClient } from "./client";

export type MobileAccountResponse = UserIdentityResponse;

export interface RegisterPasskeyOptionsResponse {
  options: Parameters<typeof passkeyCreate>[0];
  challenge: string;
}

type RefreshAccessToken = () => Promise<string | null>;

function createHostedClient(
  serverUrl: string,
  token: string,
  onUnauthorized?: RefreshAccessToken,
) {
  return createApiClient(serverUrl, { authToken: token, onUnauthorized });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createPkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = bytesToHex(Crypto.getRandomBytes(32));
  const challenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
  );

  return { verifier, challenge: challenge.toLowerCase() };
}

export function isRecentAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.code === RECENT_AUTH_REQUIRED_CODE;
}

export function formatPasskeyTitle(passkey: UserPasskeyResponse): string {
  const deviceType = passkey.credentialDeviceType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  const title = deviceType
    ? `${deviceType[0]?.toUpperCase() ?? ""}${deviceType.slice(1)} passkey`
    : "Passkey";

  return passkey.credentialBackedUp ? `${title} (backed up)` : title;
}

export function listPasskeys(
  serverUrl: string,
  token: string,
  onUnauthorized?: RefreshAccessToken,
) {
  return createHostedClient(serverUrl, token, onUnauthorized).request<
    UserPasskeyResponse[]
  >("/api/mobile/passkeys");
}

export function deletePasskey(
  serverUrl: string,
  token: string,
  credentialId: string,
  onUnauthorized?: RefreshAccessToken,
) {
  const body: DeleteUserPasskeyRequest = { credentialId };
  return createHostedClient(serverUrl, token, onUnauthorized).request<void>(
    "/api/mobile/passkeys",
    {
      method: "DELETE",
      body,
    },
  );
}

export function getMobileAccount(
  serverUrl: string,
  token: string,
  onUnauthorized?: RefreshAccessToken,
) {
  return createHostedClient(
    serverUrl,
    token,
    onUnauthorized,
  ).request<MobileAccountResponse>("/api/mobile/account");
}

export function deleteMobileAccount(
  serverUrl: string,
  token: string,
  email: string,
  onUnauthorized?: RefreshAccessToken,
) {
  const body: DeleteUserAccountRequest = { email };
  return createHostedClient(serverUrl, token, onUnauthorized).request<void>(
    "/api/mobile/account",
    {
      method: "DELETE",
      body,
    },
  );
}

/**
 * Connects an additional OAuth provider to the current hosted account.
 *
 * The provider callback contains only a short-lived code. The PKCE verifier
 * remains in the app and is supplied directly to the hosted server after the
 * browser session closes, so the callback cannot grant access on its own.
 */
export async function linkConnectedAccount(
  serverUrl: string,
  token: string,
  provider: ConnectedAccountProvider,
  onUnauthorized?: RefreshAccessToken,
) {
  const { verifier, challenge } = await createPkcePair();
  const redirect = Linking.createURL("auth");
  const client = createHostedClient(serverUrl, token, onUnauthorized);
  const { authorizationUrl } =
    await client.request<StartMobileProviderLinkResponse>(
      "/api/mobile/connected-accounts/link/start",
      {
        method: "POST",
        body: { provider, challenge, redirect },
      },
    );

  if (!authorizationUrl?.trim()) {
    throw new ApiError(
      "The server did not return a provider sign-in URL. Make sure the deployment includes mobile provider linking support.",
    );
  }

  const result = await WebBrowser.openAuthSessionAsync(
    authorizationUrl,
    redirect,
  );

  if (result.type !== "success") {
    throw new ApiError("Provider sign-in was cancelled before it completed.");
  }

  const code = parseMobileAuthCallback(result.url);

  if (!code) {
    throw new ApiError(
      "The server did not return a provider link code. Try connecting the provider again.",
    );
  }

  return client.request<ConfirmMobileProviderLinkResponse>(
    "/api/mobile/connected-accounts/link/confirm",
    {
      method: "POST",
      body: { code, verifier },
    },
  );
}

export function deleteConnectedAccount(
  serverUrl: string,
  token: string,
  accountId: string,
  onUnauthorized?: RefreshAccessToken,
) {
  const body: DeleteConnectedAccountRequest = { accountId };
  return createHostedClient(serverUrl, token, onUnauthorized).request<void>(
    "/api/mobile/connected-accounts",
    {
      method: "DELETE",
      body,
    },
  );
}

export async function registerPasskey(
  serverUrl: string,
  token: string,
  onUnauthorized?: RefreshAccessToken,
) {
  const client = createHostedClient(serverUrl, token, onUnauthorized);
  const { options, challenge } =
    await client.request<RegisterPasskeyOptionsResponse>(
      "/api/mobile/passkey/register/options",
      { method: "POST" },
    );

  const response = await passkeyCreate(options);
  if (!response) {
    throw new ApiError("Passkey registration was cancelled.");
  }

  const publicKey = response.response.getPublicKey?.();
  const serialisableResponse = {
    ...response,
    response: {
      ...response.response,
      ...(publicKey ? { publicKey } : {}),
    },
  };

  return client.request<UserPasskeyResponse>(
    "/api/mobile/passkey/register/verify",
    {
      method: "POST",
      body: { response: serialisableResponse, challenge },
    },
  );
}
