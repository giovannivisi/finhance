import "server-only";

import { cache } from "react";
import type { UserSettingsResponse } from "@finhance/shared/users";
import { api } from "@lib/server-api";
import { getDefaultUserSettings, mergeUserSettings } from "@lib/user-settings";

export const getUserSettings = cache(
  async (): Promise<UserSettingsResponse> => {
    const settings = await api<UserSettingsResponse>("/users/me/settings");
    return mergeUserSettings(settings);
  },
);

export const getUserSettingsOrDefaults = cache(
  async (): Promise<UserSettingsResponse> => {
    try {
      return await getUserSettings();
    } catch {
      return getDefaultUserSettings();
    }
  },
);
