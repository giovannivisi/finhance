import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { formatDateLabel } from "@/lib/dates";
import { fonts, radius, spacing, useTheme } from "@/theme";

import { Button } from "./button";
import { Sheet, type SheetOption, OptionSheet } from "./sheet";
import { AppText } from "./text";

export interface FieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Field({ label, error, hint, children, style }: FieldProps) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <AppText variant="caption" tone="tertiary" style={{ letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </AppText>
      {children}
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="tertiary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

interface InputStyleResult {
  container: ViewStyle & TextStyle;
  textColor: string;
  placeholderColor: string;
}

export function useInputStyle(): InputStyleResult {
  const { colors } = useTheme();
  return {
    container: {
      minHeight: 48,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: colors.borderControl,
      backgroundColor: colors.bgControl,
      paddingHorizontal: spacing.lg,
      justifyContent: "center",
    },
    textColor: colors.textPrimary,
    placeholderColor: colors.textTertiary,
  };
}

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
}

export function TextField({
  label,
  error,
  hint,
  multiline,
  ...inputProps
}: TextFieldProps) {
  const input = useInputStyle();

  return (
    <Field label={label} error={error} hint={hint}>
      <TextInput
        {...inputProps}
        multiline={multiline}
        style={[
          input.container,
          {
            color: input.textColor,
            fontFamily: fonts.regular,
            fontSize: 15,
            paddingVertical: multiline ? 12 : 6,
            minHeight: multiline ? 84 : 48,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
        placeholderTextColor={input.placeholderColor}
      />
    </Field>
  );
}

export interface AmountFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  currency?: string;
  error?: string | null;
  hint?: string;
  placeholder?: string;
}

export function AmountField({
  label,
  value,
  onChangeText,
  currency,
  error,
  hint,
  placeholder = "0.00",
}: AmountFieldProps) {
  const input = useInputStyle();

  return (
    <Field label={label} error={error} hint={hint}>
      <View
        style={[
          input.container,
          { flexDirection: "row", alignItems: "center", gap: spacing.sm },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={{
            flex: 1,
            color: input.textColor,
            fontFamily: fonts.semibold,
            fontSize: 17,
            paddingVertical: 6,
            fontVariant: ["tabular-nums"],
          }}
          placeholderTextColor={input.placeholderColor}
        />
        {currency ? (
          <AppText variant="footnoteMedium" tone="tertiary">
            {currency}
          </AppText>
        ) : null}
      </View>
    </Field>
  );
}

export interface SelectFieldProps<T extends string> {
  label: string;
  placeholder?: string;
  options: readonly SheetOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
}

export function SelectField<T extends string>({
  label,
  placeholder = "Select…",
  options,
  value,
  onChange,
  error,
  hint,
  disabled,
}: SelectFieldProps<T>) {
  const input = useInputStyle();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Field label={label} error={error} hint={hint}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          input.container,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          },
          pressed ? { opacity: 0.7 } : null,
          disabled ? { opacity: 0.5 } : null,
        ]}
      >
        <AppText
          variant="body"
          tone={selected ? "primary" : "tertiary"}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {selected ? selected.label : placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
      </Pressable>
      <OptionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        options={options}
        selectedValue={value}
        onSelect={onChange}
      />
    </Field>
  );
}

export interface DateFieldProps {
  label: string;
  /** Local date string YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
}

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
}: DateFieldProps) {
  const input = useInputStyle();
  const { colors, scheme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: parseLocalDate(value),
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) {
            onChange(toLocalDateString(date));
          }
        },
      });
      return;
    }

    setSheetOpen(true);
  };

  return (
    <Field label={label} error={error} hint={hint}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDateLabel(value)}`}
        onPress={openPicker}
        style={({ pressed }) => [
          input.container,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <AppText variant="body">{formatDateLabel(value)}</AppText>
        <Ionicons
          name="calendar-outline"
          size={16}
          color={colors.textTertiary}
        />
      </Pressable>
      {Platform.OS !== "android" ? (
        <Sheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={label}
        >
          <View style={{ alignItems: "center" }}>
            <DateTimePicker
              value={parseLocalDate(value)}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              themeVariant={scheme}
              accentColor={colors.primary}
              onChange={(event, date) => {
                if (date) {
                  onChange(toLocalDateString(date));
                }
              }}
            />
          </View>
          <Button label="Done" onPress={() => setSheetOpen(false)} />
        </Sheet>
      ) : null}
    </Field>
  );
}

export interface SwitchFieldProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function SwitchField({
  label,
  description,
  value,
  onChange,
}: SwitchFieldProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        minHeight: 48,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="bodyMedium">{label}</AppText>
        {description ? (
          <AppText variant="footnote" tone="secondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.bgControl }}
        thumbColor="#ffffff"
      />
    </View>
  );
}
