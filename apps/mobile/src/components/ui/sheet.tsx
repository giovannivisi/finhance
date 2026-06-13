import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, useTheme } from "@/theme";

import { AppText } from "./text";

/** System-material glass on iOS, solid popover surface elsewhere. */
function SheetSurface({
  style,
  children,
}: {
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colors, scheme } = useTheme();

  if (Platform.OS === "ios") {
    return (
      <BlurView
        intensity={70}
        tint={
          scheme === "dark"
            ? "systemThickMaterialDark"
            : "systemThickMaterialLight"
        }
        style={[
          style,
          {
            backgroundColor: colors.bgPopover,
            overflow: "hidden",
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.bgPopover },
          ]}
        />
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[style, { backgroundColor: colors.bgPopover }]}>
      {children}
    </View>
  );
}

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Max proportion of the screen the sheet content may take. */
  maxHeightRatio?: number;
}

/** Bottom sheet built on the core Modal so it works everywhere. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeightRatio = 0.82,
}: SheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(0)).current;
  const scrollOffsetY = useRef(0);
  const sheetMaxHeight = Math.round(height * maxHeightRatio);

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      scrollOffsetY.current = 0;
    }
  }, [translateY, visible]);

  const closeFromDrag = () => {
    Animated.timing(translateY, {
      toValue: 480,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const resetDrag = () => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 22,
      stiffness: 240,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gestureState) =>
      scrollOffsetY.current <= 0 &&
      gestureState.dy > 8 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.4,
    onPanResponderMove: (_, gestureState) => {
      translateY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 96 || gestureState.vy > 1.2) {
        closeFromDrag();
        return;
      }

      resetDrag();
    },
    onPanResponderTerminate: resetDrag,
    onPanResponderTerminationRequest: () => true,
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor:
              scheme === "dark" ? "rgba(0,0,0,0.6)" : "rgba(24,24,27,0.3)",
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Animated.View
            {...panResponder.panHandlers}
            style={{
              transform: [{ translateY }],
              width: "100%",
            }}
          >
            <SheetSurface
              style={{
                width: "100%",
                backgroundColor: colors.bgPopover,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: colors.borderStrong,
                paddingBottom: insets.bottom + spacing.lg,
                maxHeight: sheetMaxHeight,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  paddingTop: spacing.sm,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: colors.borderStrong,
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.sm,
                }}
              >
                <AppText variant="title2">{title ?? ""}</AppText>
                <Pressable
                  accessibilityLabel="Close sheet"
                  onPress={onClose}
                  hitSlop={10}
                  style={({ pressed }) => [
                    {
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.bgControl,
                    },
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.sm,
                  gap: spacing.md,
                }}
                keyboardShouldPersistTaps="handled"
                onScroll={(event) => {
                  scrollOffsetY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            </SheetSurface>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
  disabled?: boolean;
}

export interface OptionSheetProps<T extends string> {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly SheetOption<T>[];
  selectedValue?: T | null;
  onSelect: (value: T) => void;
  emptyLabel?: string;
}

/** Single-select option list presented in a bottom sheet. */
export function OptionSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
  emptyLabel,
}: OptionSheetProps<T>) {
  const { colors } = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingBottom: spacing.md }}>
        {options.length === 0 ? (
          <AppText variant="footnote" tone="secondary">
            {emptyLabel ?? "Nothing available yet."}
          </AppText>
        ) : (
          options.map((option, index) => {
            const selected = option.value === selectedValue;
            return (
              <Pressable
                key={option.value}
                disabled={option.disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: option.disabled }}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.md,
                    paddingVertical: 14,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  },
                  pressed ? { opacity: 0.65 } : null,
                  option.disabled ? { opacity: 0.4 } : null,
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    variant="bodyMedium"
                    tone={selected ? "accent" : "primary"}
                    numberOfLines={1}
                  >
                    {option.label}
                  </AppText>
                  {option.detail ? (
                    <AppText
                      variant="footnote"
                      tone="secondary"
                      numberOfLines={1}
                    >
                      {option.detail}
                    </AppText>
                  ) : null}
                </View>
                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.primary}
                  />
                ) : null}
              </Pressable>
            );
          })
        )}
      </View>
    </Sheet>
  );
}
