import { formatMoney, type FormatMoneyOptions } from "@/lib/money";
import { useAppPreferences } from "@/prefs";
import { useTheme } from "@/theme";

import { AppText, type AppTextProps } from "./text";

export interface MoneyTextProps extends Omit<AppTextProps, "children"> {
  amount: number;
  currency: string;
  /** Colour by sign: positive=income green, negative=expense red. */
  colorBySign?: boolean;
  signDisplay?: FormatMoneyOptions["signDisplay"];
  maximumFractionDigits?: number;
  compact?: boolean;
  /** Overrides the global hide-money preference when provided. */
  hide?: boolean;
}

export function MoneyText({
  amount,
  currency,
  colorBySign = false,
  signDisplay,
  maximumFractionDigits,
  compact,
  hide,
  tone,
  ...textProps
}: MoneyTextProps) {
  const { hideMoney } = useTheme();
  const { formatConfig } = useAppPreferences();
  const shouldHide = hide ?? hideMoney;

  const resolvedTone =
    tone ??
    (colorBySign && !shouldHide
      ? amount > 0
        ? "income"
        : amount < 0
          ? "expense"
          : "secondary"
      : "primary");

  return (
    <AppText {...textProps} tone={resolvedTone} tabular>
      {formatMoney(amount, currency, {
        hide: shouldHide,
        signDisplay,
        maximumFractionDigits,
        compact,
        locale: formatConfig.locale,
      })}
    </AppText>
  );
}
