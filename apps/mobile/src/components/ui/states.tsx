import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ApiError } from "@/api/client";
import { radius, spacing, useTheme } from "@/theme";

import { Button } from "./button";
import { Card } from "./card";
import { AppText } from "./text";

export function Skeleton({
  height = 16,
  width = "100%",
  style,
}: {
  height?: number;
  width?: ViewStyle["width"];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: 10,
          backgroundColor: colors.bgControl,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Skeleton width="42%" height={12} />
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} height={16} width={`${92 - index * 14}%`} />
        ))}
      </View>
    </Card>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 48,
        gap: spacing.md,
      }}
    >
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <AppText variant="footnote" tone="secondary">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = "leaf-outline",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <Card surface="muted">
      <View
        style={{
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.lg,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.bgControl,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name={icon} size={24} color={colors.textTertiary} />
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <AppText variant="title3" style={{ textAlign: "center" }}>
            {title}
          </AppText>
          {description ? (
            <AppText
              variant="footnote"
              tone="secondary"
              style={{ textAlign: "center", maxWidth: 280 }}
            >
              {description}
            </AppText>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Button
            label={actionLabel}
            onPress={onAction}
            size="sm"
            variant="secondary"
          />
        ) : null}
      </View>
    </Card>
  );
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong.";
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <Card surface="danger">
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <AppText variant="title3" tone="danger">
            Could not load data
          </AppText>
        </View>
        <AppText variant="footnote" tone="secondary">
          {describeError(error)}
        </AppText>
        {onRetry ? (
          <Button
            label="Try again"
            onPress={onRetry}
            size="sm"
            variant="secondary"
          />
        ) : null}
      </View>
    </Card>
  );
}
