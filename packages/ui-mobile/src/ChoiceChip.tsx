import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { theme } from "./theme";

export interface ChoiceChipProps extends Omit<PressableProps, "children"> {
  label: string;
  selected?: boolean;
}

export function ChoiceChip({ label, selected = false, disabled, style, ...props }: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={(state) => [styles.base, selected && styles.selected, state.pressed && styles.pressed, disabled && styles.disabled, typeof style === "function" ? style(state) : style]}
      {...props}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  selected: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brand },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.42 },
  label: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "700", fontSize: 13 },
  labelSelected: { color: "#FFFFFF" },
});
