import "server-only";

import type { UserSettingsResponse } from "@finhance/shared/users";
import { api } from "@lib/server-api";
import { getDefaultUserSettings, mergeUserSettings } from "@lib/user-settings";

export async function getUserSettings(): Promise<UserSettingsResponse> {
  const settings = await api<UserSettingsResponse>("/users/me/settings");
  return mergeUserSettings(settings);
}

export async function getUserSettingsOrDefaults(): Promise<UserSettingsResponse> {
  try {
    return await getUserSettings();
  } catch {
    return getDefaultUserSettings();
  }
}
