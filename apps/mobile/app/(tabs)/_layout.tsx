import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui";
import { useTheme } from "@/theme";

const TAB_ICONS: Record<
  string,
  {
    active: keyof typeof Ionicons.glyphMap;
    inactive: keyof typeof Ionicons.glyphMap;
  }
> = {
  index: { active: "home", inactive: "home-outline" },
  activity: { active: "swap-vertical", inactive: "swap-vertical-outline" },
  budgets: { active: "pie-chart", inactive: "pie-chart-outline" },
  analytics: { active: "trending-up", inactive: "trending-up-outline" },
  more: { active: "grid", inactive: "grid-outline" },
};

function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const pill = (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: 6,
        paddingVertical: 6,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key] ?? {};
        const label = options?.title ?? route.name;
        const focused = state.index === index;
        const icons = TAB_ICONS[route.name] ?? TAB_ICONS.index;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync().catch(() => undefined);
              }
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              paddingVertical: 8,
              borderRadius: 22,
              backgroundColor: focused ? colors.bgTabActive : "transparent",
            }}
          >
            <Ionicons
              name={focused ? icons!.active : icons!.inactive}
              size={21}
              color={focused ? colors.textPrimary : colors.textSecondary}
            />
            <AppText
              variant="caption"
              tone={focused ? "primary" : "tertiary"}
              style={{ fontSize: 10.5 }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  const containerStyle = {
    position: "absolute" as const,
    left: 16,
    right: 16,
    bottom: Math.max(insets.bottom, 12),
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden" as const,
    shadowColor: "#000000",
    shadowOpacity: scheme === "dark" ? 0.45 : 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  };

  if (Platform.OS === "ios") {
    return (
      <BlurView
        intensity={50}
        tint={
          scheme === "dark"
            ? "systemThickMaterialDark"
            : "systemThickMaterialLight"
        }
        style={containerStyle}
      >
        {pill}
      </BlurView>
    );
  }

  return (
    <View style={[containerStyle, { backgroundColor: colors.bgTabPill }]}>
      {pill}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlassTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="activity" options={{ title: "Activity" }} />
      <Tabs.Screen name="budgets" options={{ title: "Budgets" }} />
      <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
