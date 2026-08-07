import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export type TaskCheckState = "pending" | "selected" | "complete" | "missed" | "locked";

export interface TaskCheckProps {
  title: string;
  meta?: string;
  points: number;
  state: TaskCheckState;
  mode?: "today" | "history";
  onPress?: () => void;
}

const statusFor = (state: TaskCheckState, mode: "today" | "history") => {
  if (mode === "history") {
    if (state === "selected" || state === "complete") return "COMPLETED";
    if (state === "locked") return "EXCUSED";
    return "NOT COMPLETED";
  }
  if (state === "selected") return "POWERED UP";
  if (state === "complete") return "POINTS BANKED";
  if (state === "missed") return "DAY CLOSED";
  if (state === "locked") return "REST DAY";
  return "TODAY'S TASK";
};

export function TaskCheck({ title, meta, points, state, mode = "today", onPress }: TaskCheckProps) {
  const disabled = state === "locked" || (mode === "today" && state === "missed");
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== "selected") return;
    scale.setValue(0.95);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 190, useNativeDriver: true }).start();
  }, [scale, state]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: state === "selected", disabled }}
        accessibilityLabel={`${title}, ${statusFor(state, mode)}`}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          state === "selected" && styles.selectedCard,
          state === "complete" && styles.completeCard,
          state === "missed" && styles.missedCard,
          state === "locked" && styles.lockedCard,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View style={styles.copy}>
          <Text style={[styles.status, state === "selected" && styles.statusSelected, state === "complete" && styles.statusComplete]}>{statusFor(state, mode)}</Text>
          <Text style={[styles.title, state === "selected" && styles.titleSelected]}>{title}</Text>
          {meta ? <Text numberOfLines={2} style={[styles.meta, state === "selected" && styles.metaSelected]}>{meta}</Text> : null}
        </View>
        <View style={[styles.reward, state === "selected" && styles.rewardSelected, state === "complete" && styles.rewardComplete, (state === "missed" || state === "locked" || (mode === "history" && state === "pending")) && styles.rewardMuted]}>
          <Text style={[styles.rewardValue, state === "selected" && styles.rewardValueSelected, state === "complete" && styles.rewardValueComplete, (state === "missed" || (mode === "history" && state === "pending")) && styles.rewardValueMissed]}>{state === "missed" || (mode === "history" && state === "pending") ? "−3" : state === "locked" ? "0" : state === "complete" ? points : `+${points}`}</Text>
          <Text style={[styles.rewardLabel, state === "selected" && styles.rewardLabelSelected, state === "complete" && styles.rewardLabelComplete, (state === "missed" || (mode === "history" && state === "pending")) && styles.rewardLabelMissed]}>POINTS</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: 14, padding: 17, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, shadowColor: theme.colors.brand, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  selectedCard: { borderWidth: 2, borderColor: theme.colors.brandStrong, backgroundColor: theme.colors.brand, shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  completeCard: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
  missedCard: { backgroundColor: theme.colors.subtle, opacity: 0.72 },
  lockedCard: { backgroundColor: theme.colors.subtle, opacity: 0.72 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  copy: { flex: 1, gap: 4 },
  status: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 },
  statusSelected: { color: theme.colors.accentSoft },
  statusComplete: { color: theme.colors.textSecondary },
  title: { color: theme.colors.text, fontFamily: theme.type.body, fontSize: 17, fontWeight: "800" },
  titleSelected: { color: "#fff" },
  meta: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 17 },
  metaSelected: { color: "#FFF5EF" },
  reward: { minWidth: 64, minHeight: 62, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: theme.colors.brandSoft },
  rewardSelected: { backgroundColor: theme.colors.accent },
  rewardComplete: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.accent },
  rewardMuted: { backgroundColor: theme.colors.surface },
  rewardValue: { color: theme.colors.brandStrong, fontFamily: theme.type.display, fontSize: 26, lineHeight: 28 },
  rewardValueSelected: { color: theme.colors.text },
  rewardValueComplete: { color: theme.colors.text },
  rewardValueMissed: { color: theme.colors.danger },
  rewardLabel: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 6, letterSpacing: 0.9 },
  rewardLabelSelected: { color: theme.colors.text },
  rewardLabelComplete: { color: theme.colors.textSecondary },
  rewardLabelMissed: { color: theme.colors.danger },
});
