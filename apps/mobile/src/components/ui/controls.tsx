import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius, spacing, useTheme } from "@/theme";

import { AppText } from "./text";

export type ChipTone =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  tone = "neutral",
  selected,
  onPress,
  style,
}: ChipProps) {
  const { colors } = useTheme();

  const palette: Record<
    ChipTone,
    { bg: string; border: string; text: string }
  > = {
    neutral: {
      bg: colors.bgCardMuted,
      border: colors.border,
      text: colors.textSecondary,
    },
    accent: {
      bg: colors.surfaceSuccessBg,
      border: colors.surfaceSuccessBorder,
      text: colors.primary,
    },
    info: {
      bg: colors.surfaceInfoBg,
      border: colors.surfaceInfoBorder,
      text: colors.info,
    },
    success: {
      bg: colors.surfaceSuccessBg,
      border: colors.surfaceSuccessBorder,
      text: colors.success,
    },
    warning: {
      bg: colors.surfaceWarningBg,
      border: colors.surfaceWarningBorder,
      text: colors.warning,
    },
    danger: {
      bg: colors.surfaceDangerBg,
      border: colors.surfaceDangerBorder,
      text: colors.danger,
    },
  };

  const { bg, border, text } = palette[tone];

  const body = (
    <View
      style={[
        {
          paddingHorizontal: 11,
          paddingVertical: 5,
          borderRadius: radius.chip,
          borderWidth: 1,
          backgroundColor: selected ? colors.primary : bg,
          borderColor: selected ? colors.primary : border,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <AppText
        variant="caption"
        style={{ color: selected ? "#ffffff" : text }}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </View>
  );

  if (!onPress) {
    return body;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      {body}
    </Pressable>
  );
}

export interface ChipRowOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipRowProps<T extends string> {
  options: readonly ChipRowOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

/** Horizontally scrollable chip filter row. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  style,
}: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}

export interface SegmentedControlProps<T extends string> {
  options: readonly ChipRowOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: "row",
          backgroundColor: colors.bgControl,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 3,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: radius.control - 4,
              alignItems: "center",
              backgroundColor: selected ? colors.bgTabActive : "transparent",
            }}
          >
            <AppText
              variant="footnoteMedium"
              tone={selected ? "primary" : "secondary"}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ProgressBarProps {
  /** 0..1; values above 1 render an overflow accent. */
  ratio: number | null;
  tone?: "accent" | "danger" | "warning" | "neutral";
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  ratio,
  tone = "accent",
  style,
}: ProgressBarProps) {
  const { colors } = useTheme();

  const fillColor =
    tone === "danger"
      ? colors.expense
      : tone === "warning"
        ? "#f59e0b"
        : tone === "neutral"
          ? colors.chartBudget
          : colors.primary;

  const clamped = ratio === null ? 0 : Math.max(0, Math.min(ratio, 1));

  return (
    <View
      style={[
        {
          height: 7,
          borderRadius: 4,
          backgroundColor: colors.bgControl,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: "100%",
          borderRadius: 4,
          backgroundColor: fillColor,
        }}
      />
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { height: 1, backgroundColor: colors.border, width: "100%" },
        style,
      ]}
    />
  );
}

export interface ListRowProps {
  left?: ReactNode;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
  titleLines?: number;
}

/** Standard tappable row used inside cards/lists. */
export function ListRow({
  left,
  title,
  subtitle,
  right,
  onPress,
  showDivider,
  titleLines = 1,
}: ListRowProps) {
  const { colors } = useTheme();

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: 13,
        minHeight: 56,
      }}
    >
      {left ? <View>{left}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <AppText variant="bodyMedium" numberOfLines={titleLines}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={{ alignItems: "flex-end" }}>{right}</View> : null}
    </View>
  );

  return (
    <View
      style={
        showDivider
          ? { borderBottomWidth: 1, borderBottomColor: colors.border }
          : null
      }
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => (pressed ? { opacity: 0.65 } : null)}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}
