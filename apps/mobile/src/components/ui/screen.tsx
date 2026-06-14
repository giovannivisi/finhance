import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { spacing, useTheme } from "@/theme";

import { IconButton } from "./button";
import { AppText } from "./text";

// iOS uses the system tab bar (~49pt, content scrolls beneath its glass);
// Android uses the taller floating pill.
export const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 76 : 108;

/**
 * Soft brand glow behind every screen — gives the dark theme depth and the
 * system glass something to refract. Nearly invisible in light mode.
 */
function ScreenGlow() {
  const { colors, scheme } = useTheme();

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 560,
        overflow: "hidden",
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="screen-glow" cx="22%" cy="-12%" r="78%">
            <Stop
              offset="0%"
              stopColor={colors.primary}
              stopOpacity={scheme === "dark" ? 0.16 : 0.07}
            />
            <Stop offset="55%" stopColor={colors.primary} stopOpacity={0.04} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#screen-glow)" />
      </Svg>
    </View>
  );
}

export interface ScreenProps {
  /** Small uppercase label above the title. */
  kicker?: string;
  title?: string;
  /** Right side of the header row. */
  headerRight?: ReactNode;
  /** Shows a back button when not inside the tab shell. */
  showBack?: boolean;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<unknown>;
  /** Adds bottom padding so the floating tab bar does not cover content. */
  withTabBarClearance?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** When false, renders children directly without a ScrollView. */
  scroll?: boolean;
}

export function Screen({
  kicker,
  title,
  headerRight,
  showBack = false,
  children,
  refreshing,
  onRefresh,
  withTabBarClearance = false,
  contentStyle,
  scroll = true,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  useEffect(() => {
    if (!refreshing) {
      setIsPullRefreshing(false);
    }
  }, [refreshing]);

  const handleRefresh = useCallback(() => {
    if (!onRefresh) {
      return;
    }

    setIsPullRefreshing(true);
    const result = onRefresh();

    if (result && typeof result === "object" && "finally" in result) {
      void (result as Promise<unknown>)
        .finally(() => {
          setIsPullRefreshing(false);
        })
        .catch(() => undefined);
    }
  }, [onRefresh]);

  const header =
    kicker || title || headerRight || showBack ? (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingBottom: spacing.lg,
        }}
      >
        {showBack ? (
          <IconButton
            accessibilityLabel="Go back"
            icon={
              <Ionicons
                name="chevron-back"
                size={20}
                color={colors.textPrimary}
              />
            }
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
          />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {kicker ? (
            <AppText variant="kicker" tone="accent">
              {kicker}
            </AppText>
          ) : null}
          {title ? (
            <AppText
              variant="title1"
              numberOfLines={1}
              style={{
                marginTop: kicker ? 4 : 0,
                fontSize: 30,
                lineHeight: 36,
                letterSpacing: -0.8,
              }}
            >
              {title}
            </AppText>
          ) : null}
        </View>
        {headerRight ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {headerRight}
          </View>
        ) : null}
      </View>
    ) : null;

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: colors.bgApp,
  };

  const innerPadding: ViewStyle = {
    paddingTop: insets.top + spacing.md,
    paddingHorizontal: spacing.xl,
  };

  if (!scroll) {
    return (
      <View style={containerStyle}>
        <ScreenGlow />
        <View style={[innerPadding, { flex: 1 }, contentStyle]}>
          {header}
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <ScreenGlow />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          innerPadding,
          {
            paddingBottom:
              (withTabBarClearance ? TAB_BAR_CLEARANCE : spacing.xxl) +
              insets.bottom,
            gap: spacing.xl,
          },
          contentStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textSecondary}
            />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {header}
        {children}
      </ScrollView>
    </View>
  );
}
