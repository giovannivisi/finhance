"use client";

import type { CSSProperties } from "react";
import { useAppPreferences } from "@components/ThemeProvider";
import { formatSensitiveCurrency } from "@lib/money";

export default function MoneyValue({
  value,
  currency = "EUR",
  fallback = "Unavailable",
  className,
  style,
}: {
  value: number | null | undefined;
  currency?: string;
  fallback?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHide = !isHydrated || hideMoney;

  return (
    <span className={className} style={style}>
      {formatSensitiveCurrency(value, currency, shouldHide, fallback)}
    </span>
  );
}
