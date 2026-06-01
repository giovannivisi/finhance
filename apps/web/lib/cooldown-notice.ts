const COOLDOWN_NOTICE_PATTERN = /^(.*?)(Try again in )(\d+)(s(?:\.{3}|\.)?)$/;

export interface ParsedCooldownNotice {
  prefix: string;
  seconds: number;
  suffix: string;
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
    suffix: match[4],
  };
}

export function formatCooldownNotice(
  parsedNotice: ParsedCooldownNotice,
  secondsRemaining: number,
): string {
  const nextSeconds = secondsRemaining <= 0 ? 0 : secondsRemaining;
  return `${parsedNotice.prefix}${nextSeconds}${parsedNotice.suffix}`;
}
