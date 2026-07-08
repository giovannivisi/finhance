export interface FormatConfig {
  locale: string;
  hour12: boolean;
}

const DEFAULT_FORMAT_CONFIG: FormatConfig = {
  locale: "en-GB",
  hour12: false,
};

let currentFormatConfig: FormatConfig = DEFAULT_FORMAT_CONFIG;

export function getFormatConfig(): FormatConfig {
  return currentFormatConfig;
}

export function setFormatConfig(next: FormatConfig): void {
  currentFormatConfig = {
    locale: next.locale.trim() || DEFAULT_FORMAT_CONFIG.locale,
    hour12: next.hour12,
  };
}

export function resetFormatConfig(): void {
  currentFormatConfig = DEFAULT_FORMAT_CONFIG;
}
