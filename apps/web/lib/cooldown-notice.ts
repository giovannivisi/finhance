const COOLDOWN_NOTICE_PATTERN = /^(.*?)(Try again in )(\d+)(s\.)$/;

export interface ParsedCooldownNotice {
  prefix: string;
  seconds: number;
}

export function parseCooldownNotice(
  notice: string | null | undefined,
): ParsedCooldownNotice | null {
  if (!notice) {
    return null;
  }

  const match = COOLDOWN_NOTICE_PATTERN.exec(notice);
  if (!match) {
    return null;
  }

  const seconds = Number.parseInt(match[3], 10);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return {
    prefix: `${match[1]}${match[2]}`,
    seconds,
  };
}

export function formatCooldownNotice(
  parsedNotice: ParsedCooldownNotice,
  secondsRemaining: number,
): string {
  if (secondsRemaining <= 0) {
    return `${parsedNotice.prefix}0s.`;
  }

  return `${parsedNotice.prefix}${secondsRemaining}s.`;
}
