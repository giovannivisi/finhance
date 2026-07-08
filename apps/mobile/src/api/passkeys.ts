import {
  RECENT_AUTH_REQUIRED_CODE,
  type DeleteUserAccountRequest,
  type DeleteUserPasskeyRequest,
  type UserPasskeyResponse,
} from "@finhance/shared/users";
import { create as passkeyCreate } from "react-native-passkeys";

import { ApiError, createApiClient } from "./client";

export interface MobileAccountResponse {
  email: string | null;
}

export interface RegisterPasskeyOptionsResponse {
  options: Parameters<typeof passkeyCreate>[0];
  challenge: string;
}

function createHostedClient(serverUrl: string, token: string) {
  return createApiClient(serverUrl, { authToken: token });
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

export function listPasskeys(serverUrl: string, token: string) {
  return createHostedClient(serverUrl, token).request<UserPasskeyResponse[]>(
    "/api/mobile/passkeys",
  );
}

export function deletePasskey(
  serverUrl: string,
  token: string,
  credentialId: string,
) {
  const body: DeleteUserPasskeyRequest = { credentialId };
  return createHostedClient(serverUrl, token).request<void>(
    "/api/mobile/passkeys",
    {
      method: "DELETE",
      body,
    },
  );
}

export function getMobileAccount(serverUrl: string, token: string) {
  return createHostedClient(serverUrl, token).request<MobileAccountResponse>(
    "/api/mobile/account",
  );
}

export function deleteMobileAccount(
  serverUrl: string,
  token: string,
  email: string,
) {
  const body: DeleteUserAccountRequest = { email };
  return createHostedClient(serverUrl, token).request<void>(
    "/api/mobile/account",
    {
      method: "DELETE",
      body,
    },
  );
}

export async function registerPasskey(serverUrl: string, token: string) {
  const client = createHostedClient(serverUrl, token);
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
