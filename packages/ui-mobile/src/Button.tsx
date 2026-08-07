import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { Icon, type IconName } from "./Icon";
import { theme } from "./theme";

export interface ButtonProps extends PressableProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
}

export function Button({ children, variant = "primary", size = "lg", loading = false, leadingIcon, trailingIcon, disabled, style, ...props }: PropsWithChildren<ButtonProps>) {
  const inverse = variant === "primary" || variant === "danger";
  const iconColor = inverse ? "#FFFFFF" : variant === "ghost" ? theme.colors.brandStrong : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [styles.base, styles[size], styles[variant], state.pressed && styles.pressed, (disabled || loading) && styles.disabled, typeof style === "function" ? style(state) : style]}
      {...props}
    >
      {loading ? <ActivityIndicator color={iconColor} /> : (
        <View style={styles.content}>
          {leadingIcon ? <Icon name={leadingIcon} size={size === "sm" ? 16 : 18} color={iconColor} /> : null}
          <Text numberOfLines={2} style={[styles.label, size === "sm" && styles.labelSmall, inverse ? styles.labelInverse : variant === "ghost" ? styles.labelGhost : styles.labelDefault]}>{children}</Text>
          {trailingIcon ? <Icon name={trailingIcon} size={size === "sm" ? 16 : 18} color={iconColor} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: theme.radius.xl, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  sm: { minHeight: 44, paddingHorizontal: theme.space.lg },
  md: { minHeight: 50, paddingHorizontal: theme.space.xl },
  lg: { minHeight: 56, paddingHorizontal: theme.space.xl },
  primary: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  secondary: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong },
  ghost: { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.brandSoft },
  danger: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.42 },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm },
  label: { flexShrink: 1, textAlign: "center", fontFamily: theme.type.body, fontWeight: "700", fontSize: 15, lineHeight: 20 },
  labelSmall: { fontSize: 13, lineHeight: 18 },
  labelDefault: { color: theme.colors.text },
  labelGhost: { color: theme.colors.brandStrong },
  labelInverse: { color: "#FFFFFF" },
});
