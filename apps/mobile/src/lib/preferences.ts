export const CLOCK_FORMAT_VALUES = ["system", "12h", "24h"] as const;
export type ClockFormat = (typeof CLOCK_FORMAT_VALUES)[number];

export const LAUNCH_TAB_VALUES = [
  "home",
  "activity",
  "wallets",
  "analytics",
] as const;
export type LaunchTab = (typeof LAUNCH_TAB_VALUES)[number];

export const LAUNCH_TAB_HREFS = {
  home: "/",
  activity: "/activity",
  wallets: "/wallets",
  analytics: "/analytics",
} as const satisfies Record<LaunchTab, string>;

export function parseClockFormat(value: unknown): ClockFormat {
  return typeof value === "string" &&
    CLOCK_FORMAT_VALUES.includes(value as ClockFormat)
    ? (value as ClockFormat)
    : "system";
}

export function parseLaunchTab(value: unknown): LaunchTab {
  return typeof value === "string" &&
    LAUNCH_TAB_VALUES.includes(value as LaunchTab)
    ? (value as LaunchTab)
    : "home";
}

export function parseBooleanPref(value: unknown): boolean {
  return value === true || value === "true";
}

export function detectDeviceLocale(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale?.trim();
    return locale || "en-GB";
  } catch {
    return "en-GB";
  }
}

export function resolveHour12(
  clockFormat: ClockFormat,
  locale = detectDeviceLocale(),
): boolean {
  if (clockFormat === "12h") {
    return true;
  }

  if (clockFormat === "24h") {
    return false;
  }

  try {
    const sample = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "numeric",
    }).format(new Date(2026, 0, 1, 13, 0));

    return !sample.includes("13");
  } catch {
    return false;
  }
}
