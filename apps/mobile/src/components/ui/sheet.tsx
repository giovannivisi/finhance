import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, useTheme } from "@/theme";

import { IconButton } from "./button";
import { AppText } from "./text";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Max proportion of the screen the sheet content may take. */
  maxHeightRatio?: number;
}

/** Modal panel matching the route-level edit screens. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeightRatio = 0.92,
}: SheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(0)).current;
  const scrollOffsetY = useRef(0);
  const sheetHeight = Math.round(height * maxHeightRatio);

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
          pointerEvents="box-none"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Animated.View
            {...panResponder.panHandlers}
            style={{
              transform: [{ translateY }],
              width: "100%",
              flex: 1,
              maxHeight: sheetHeight,
            }}
          >
            <View
              style={{
                flex: 1,
                width: "100%",
                backgroundColor: colors.bgApp,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: colors.borderStrong,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.xxl,
                  paddingBottom: spacing.lg,
                }}
              >
                <IconButton
                  accessibilityLabel="Go back"
                  icon={
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={colors.textPrimary}
                    />
                  }
                  onPress={onClose}
                />
                <AppText
                  variant="title1"
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 30,
                    lineHeight: 36,
                    letterSpacing: -0.8,
                  }}
                >
                  {title ?? ""}
                </AppText>
              </View>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: spacing.xl,
                  paddingBottom: insets.bottom + spacing.xxl,
                  gap: spacing.lg,
                }}
                automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                onScroll={(event) => {
                  scrollOffsetY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            </View>
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

/** Single-select option list presented in the shared modal panel. */
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
