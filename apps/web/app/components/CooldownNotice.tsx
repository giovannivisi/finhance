"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCooldownNotice,
  parseCooldownNotice,
} from "@lib/cooldown-notice";

export default function CooldownNotice({
  notice,
  className,
}: {
  notice: string;
  className?: string;
}) {
  const parsedNotice = useMemo(() => parseCooldownNotice(notice), [notice]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cooldownDeadlineMs] = useState<number | null>(() =>
    parsedNotice === null ? null : Date.now() + parsedNotice.seconds * 1000,
  );

  const secondsRemaining =
    cooldownDeadlineMs === null
      ? null
      : Math.max(0, Math.ceil((cooldownDeadlineMs - nowMs) / 1000));

  useEffect(() => {
    if (cooldownDeadlineMs === null || secondsRemaining === null) {
      return;
    }

    if (secondsRemaining <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNowMs(Date.now()), 1000);

    return () => window.clearTimeout(timeoutId);
  }, [cooldownDeadlineMs, secondsRemaining]);

  const text =
    parsedNotice && secondsRemaining !== null
      ? formatCooldownNotice(parsedNotice, secondsRemaining)
      : notice;

  return <p className={className}>{text}</p>;
}
