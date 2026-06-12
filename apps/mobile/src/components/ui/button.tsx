import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { fonts, radius, spacing, useTheme } from "@/theme";

import { AppText } from "./text";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  style,
  haptic = true,
}: ButtonProps) {
  const { colors } = useTheme();
  const isBlocked = disabled || loading;

  const containerByVariant: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.primary, borderColor: "transparent" },
    secondary: {
      backgroundColor: colors.bgControl,
      borderColor: colors.borderControl,
    },
    danger: {
      backgroundColor: colors.surfaceDangerBg,
      borderColor: colors.surfaceDangerBorder,
    },
    ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  };

  const textColor: Record<ButtonVariant, string> = {
    primary: "#ffffff",
    secondary: colors.textPrimary,
    danger: colors.danger,
    ghost: colors.textSecondary,
  };

  const handlePress = () => {
    if (haptic && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => undefined,
      );
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      onPress={handlePress}
      disabled={isBlocked}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          minHeight: size === "md" ? 48 : 38,
          paddingHorizontal: size === "md" ? spacing.xl : spacing.lg,
          borderRadius: radius.control,
          borderWidth: 1,
          ...containerByVariant[variant],
        },
        pressed && !isBlocked ? { opacity: 0.82 } : null,
        isBlocked ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor[variant]} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <AppText
            variant={size === "md" ? "bodySemibold" : "footnoteMedium"}
            style={{ color: textColor[variant], fontFamily: fonts.semibold }}
          >
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgControl,
          borderWidth: 1,
          borderColor: colors.borderControl,
        },
        pressed ? { opacity: 0.75 } : null,
        disabled ? { opacity: 0.45 } : null,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}
