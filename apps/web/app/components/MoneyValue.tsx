"use client";

import { useAppPreferences } from "@components/ThemeProvider";
import { formatSensitiveCurrency } from "@lib/money";

export default function MoneyValue({
  value,
  currency = "EUR",
  fallback = "Unavailable",
  className,
}: {
  value: number | null | undefined;
  currency?: string;
  fallback?: string;
  className?: string;
}) {
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHide = !isHydrated || hideMoney;

  return (
    <span className={className}>
      {formatSensitiveCurrency(value, currency, shouldHide, fallback)}
    </span>
  );
}
