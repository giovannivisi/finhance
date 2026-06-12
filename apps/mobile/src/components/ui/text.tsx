import { Text, type TextProps, type TextStyle } from "react-native";

import { fonts, useTheme } from "@/theme";

type Variant =
  | "display"
  | "title1"
  | "title2"
  | "title3"
  | "body"
  | "bodyMedium"
  | "bodySemibold"
  | "footnote"
  | "footnoteMedium"
  | "caption"
  | "kicker";

type Tone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "income"
  | "expense"
  | "danger"
  | "warning"
  | "success"
  | "info"
  | "onPrimary";

const variantStyles: Record<Variant, TextStyle> = {
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: fonts.bold,
    letterSpacing: -1,
  },
  title1: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fonts.bold,
    letterSpacing: -0.6,
  },
  title2: {
    fontSize: 19,
    lineHeight: 25,
    fontFamily: fonts.semibold,
    letterSpacing: -0.4,
  },
  title3: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.semibold,
    letterSpacing: -0.2,
  },
  body: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular },
  bodyMedium: { fontSize: 15, lineHeight: 21, fontFamily: fonts.medium },
  bodySemibold: { fontSize: 15, lineHeight: 21, fontFamily: fonts.semibold },
  footnote: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  footnoteMedium: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  caption: { fontSize: 11.5, lineHeight: 16, fontFamily: fonts.medium },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.bold,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  tabular?: boolean;
}

export function AppText({
  variant = "body",
  tone = "primary",
  tabular = false,
  style,
  ...props
}: AppTextProps) {
  const { colors } = useTheme();

  const toneColor: Record<Tone, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.primary,
    income: colors.income,
    expense: colors.expense,
    danger: colors.danger,
    warning: colors.warning,
    success: colors.success,
    info: colors.info,
    onPrimary: "#ffffff",
  };

  return (
    <Text
      {...props}
      style={[
        variantStyles[variant],
        { color: toneColor[tone] },
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  );
}
