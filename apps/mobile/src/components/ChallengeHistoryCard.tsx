import { Icon, theme } from "@shipshape/ui-mobile";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChallengeParticipationSummary } from "../features/history/challengeHistoryRepository";

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function ChallengeHistoryCard({ item, onPress, compact = false }: { item: ChallengeParticipationSummary; onPress: () => void; compact?: boolean }) {
  const forfeited = item.resultStatus === "forfeited" || item.resultStatus === "removed";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.challengeName} results`} onPress={onPress} style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}>
      <View style={styles.top}>
        <View style={[styles.status, forfeited && styles.statusForfeited]}>
          <Text style={[styles.statusText, forfeited && styles.statusTextForfeited]}>{forfeited ? "FORFEITED" : "COMPLETED"}</Text>
        </View>
        <Icon name="arrow-right" size={20} color={theme.colors.textSecondary} />
      </View>
      <Text style={styles.title}>{item.challengeName}</Text>
      <Text style={styles.date}>{dateLabel(item.startsOn)} – {dateLabel(item.endsOn)}</Text>
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.value}>{item.totalPoints}</Text><Text style={styles.label}>POINTS</Text></View>
        <View style={styles.divider}/>
        <View style={styles.stat}><Text style={styles.value}>{Math.round(item.completionPercentage)}%</Text><Text style={styles.label}>TASKS</Text></View>
        <View style={styles.divider}/>
        <View style={styles.stat}><Text style={styles.value}>{item.finalRank ? `#${item.finalRank}` : "—"}</Text><Text style={styles.label}>FINISH</Text></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 8 },
  compact: { padding: 16 },
  pressed: { opacity: .86, transform: [{ scale: .99 }] },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.successSoft },
  statusForfeited: { backgroundColor: theme.colors.dangerSoft },
  statusText: { color: theme.colors.success, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  statusTextForfeited: { color: theme.colors.danger },
  title: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 20 },
  date: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11 },
  stats: { minHeight: 54, marginTop: 5, flexDirection: "row", alignItems: "center", borderRadius: 15, backgroundColor: theme.colors.subtle },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  divider: { width: 1, height: 26, backgroundColor: theme.colors.border },
  value: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 24, lineHeight: 27 },
  label: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 7, letterSpacing: .8 },
});
