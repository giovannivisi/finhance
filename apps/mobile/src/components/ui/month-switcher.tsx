import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { addMonths, compareMonths, formatMonthLabel } from "@/lib/dates";
import { radius, spacing, useTheme } from "@/theme";

import { AppText } from "./text";

export interface MonthSwitcherProps {
  month: string;
  onChange: (month: string) => void;
  /** Months after this cannot be selected (e.g. the current month). */
  maxMonth?: string;
  minMonth?: string;
}

export function MonthSwitcher({
  month,
  onChange,
  maxMonth,
  minMonth,
}: MonthSwitcherProps) {
  const { colors } = useTheme();

  const previousDisabled = Boolean(
    minMonth && compareMonths(month, minMonth) <= 0,
  );
  const nextDisabled = Boolean(maxMonth && compareMonths(month, maxMonth) >= 0);

  const arrowStyle = (disabled: boolean) => ({
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    opacity: disabled ? 0.35 : 1,
  });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.bgControl,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.control,
        paddingHorizontal: spacing.sm,
        minHeight: 48,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        disabled={previousDisabled}
        onPress={() => onChange(addMonths(month, -1))}
        hitSlop={8}
        style={({ pressed }) => [
          arrowStyle(previousDisabled),
          pressed ? { opacity: 0.6 } : null,
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
      </Pressable>
      <AppText variant="bodySemibold" tabular>
        {formatMonthLabel(month)}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        disabled={nextDisabled}
        onPress={() => onChange(addMonths(month, 1))}
        hitSlop={8}
        style={({ pressed }) => [
          arrowStyle(nextDisabled),
          pressed ? { opacity: 0.6 } : null,
        ]}
      >
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}
