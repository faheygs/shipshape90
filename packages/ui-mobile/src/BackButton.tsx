import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { Icon } from "./Icon";
import { theme } from "./theme";

export interface BackButtonProps extends Omit<PressableProps, "children"> {
  accessibilityLabel?: string;
}

export function BackButton({ accessibilityLabel = "Go back", style, ...props }: BackButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={6}
      style={(state) => [styles.base, state.pressed && styles.pressed, typeof style === "function" ? style(state) : style]}
      {...props}
    >
      <Icon name="chevron-left" size={22} strokeWidth={2.25} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
