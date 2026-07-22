import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, spacing, useTheme } from "@/theme";

import { AppText } from "./text";

export type CardSurface =
  | "default"
  | "muted"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface CardProps {
  children: ReactNode;
  surface?: CardSurface;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Card({
  children,
  surface = "default",
  style,
  onPress,
  disabled,
  accessibilityLabel,
}: CardProps) {
  const { colors } = useTheme();

  const surfaceStyles: Record<CardSurface, ViewStyle> = {
    default: { backgroundColor: colors.bgCard, borderColor: colors.border },
    muted: { backgroundColor: colors.bgCardMuted, borderColor: colors.border },
    info: {
      backgroundColor: colors.surfaceInfoBg,
      borderColor: colors.surfaceInfoBorder,
    },
    success: {
      backgroundColor: colors.surfaceSuccessBg,
      borderColor: colors.surfaceSuccessBorder,
    },
    warning: {
      backgroundColor: colors.surfaceWarningBg,
      borderColor: colors.surfaceWarningBorder,
    },
    danger: {
      backgroundColor: colors.surfaceDangerBg,
      borderColor: colors.surfaceDangerBorder,
    },
  };

  const baseStyle: ViewStyle = {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    ...surfaceStyles[surface],
  };

  if (!onPress) {
    return <View style={[baseStyle, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        baseStyle,
        pressed ? { backgroundColor: colors.bgCardHover } : null,
        disabled ? { opacity: 0.55 } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export interface SectionProps {
  kicker?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Page section with the web app's kicker/title header pattern. */
export function Section({
  kicker,
  title,
  description,
  action,
  children,
  style,
}: SectionProps) {
  return (
    <View style={[{ gap: spacing.md }, style]}>
      {kicker || title || action ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            {kicker ? (
              <AppText variant="kicker" tone="tertiary">
                {kicker}
              </AppText>
            ) : null}
            {title ? <AppText variant="title2">{title}</AppText> : null}
            {description ? (
              <AppText variant="footnote" tone="secondary">
                {description}
              </AppText>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export interface StatProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Small labelled stat block used inside summary cards. */
export function Stat({ label, value, note, style }: StatProps) {
  return (
    <View style={[{ gap: 3, minWidth: 0, flexShrink: 1 }, style]}>
      <AppText variant="kicker" tone="tertiary" numberOfLines={1}>
        {label}
      </AppText>
      {typeof value === "string" || typeof value === "number" ? (
        <AppText variant="title3" tabular numberOfLines={1}>
          {value}
        </AppText>
      ) : (
        value
      )}
      {typeof note === "string" ? (
        <AppText variant="caption" tone="secondary">
          {note}
        </AppText>
      ) : (
        (note ?? null)
      )}
    </View>
  );
}
