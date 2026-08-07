import { BackButton, Icon, theme } from "@shipshape/ui-mobile";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChallengeHistory, useMyChallengeHistory } from "../../src/features/history/useChallengeHistory";

const dayLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export default function ChallengeHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const summaries = useMyChallengeHistory();
  const days = useChallengeHistory(id ?? "");
  const summary = summaries.data?.find((item) => item.challengeId === id);

  if (!summary) return <SafeAreaView style={styles.safe}><View style={styles.loading}><BackButton onPress={() => router.back()}/><Text style={styles.muted}>{summaries.isLoading ? "Loading result…" : "Challenge result not found."}</Text></View></SafeAreaView>;
  const forfeited = summary.resultStatus !== "completed";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.top}><BackButton onPress={() => router.back()}/><View style={[styles.status, forfeited && styles.statusForfeited]}><Text style={[styles.statusText, forfeited && styles.statusTextForfeited]}>{forfeited ? "FORFEITED" : "FINAL RESULT"}</Text></View></View>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CHALLENGE RESULT</Text>
          <Text style={styles.title}>{summary.challengeName}</Text>
          <Text style={styles.heroBody}>{forfeited ? "Your progress is preserved, but this result is not prize eligible." : `You finished #${summary.finalRank ?? "—"} out of ${summary.participantCount}.`}</Text>
          <View style={styles.scoreRow}><Text style={styles.score}>{summary.totalPoints}</Text><Text style={styles.scoreLabel}>FINAL POINTS</Text></View>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>{Math.round(summary.completionPercentage)}%</Text><Text style={styles.metricLabel}>TASK COMPLETION</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{summary.perfectDays}</Text><Text style={styles.metricLabel}>PERFECT DAYS</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{summary.daysParticipated}</Text><Text style={styles.metricLabel}>DAYS PLAYED</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{summary.completedTasks}</Text><Text style={styles.metricLabel}>TASKS DONE</Text></View>
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.sectionEyebrow}>DAY BY DAY</Text><Text style={styles.sectionTitle}>The full run.</Text></View><Icon name="calendar" color={theme.colors.brandStrong}/></View>
        {days.isLoading ? <Text style={styles.muted}>Building your timeline…</Text> : null}
        {days.isError ? <Text style={styles.error}>The daily timeline couldn’t load.</Text> : null}
        <View style={styles.dayList}>
          {(days.data ?? []).map((day) => {
            const percentage = day.taskCount ? Math.round(day.completedCount / day.taskCount * 100) : 0;
            return <View key={day.localDate} style={styles.dayCard}>
              <View style={styles.dayTop}><Text style={styles.dayDate}>{dayLabel(day.localDate)}</Text><Text style={[styles.dayPoints, day.dayPoints < 0 && styles.negative]}>{day.dayPoints > 0 ? "+" : ""}{day.dayPoints} points</Text></View>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(3, percentage)}%` }, percentage === 100 && styles.fillPerfect]} /></View>
              <Text style={styles.dayMeta}>{day.completedCount} of {day.taskCount} tasks · {percentage}%</Text>
            </View>;
          })}
        </View>
        {!days.isLoading && !days.isError && days.data?.length === 0 ? <Text style={styles.muted}>No task days were recorded for this challenge.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: 24, paddingBottom: 56, gap: 22 },
  loading: { flex: 1, padding: 24, gap: 22 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.successSoft },
  statusForfeited: { backgroundColor: theme.colors.dangerSoft },
  statusText: { color: theme.colors.success, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  statusTextForfeited: { color: theme.colors.danger },
  hero: { minHeight: 270, padding: 22, borderRadius: 27, justifyContent: "flex-end", gap: 7, backgroundColor: theme.colors.brandStrong },
  eyebrow: { color: theme.colors.accent, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1.4 },
  title: { color: "#fff", fontFamily: theme.type.display, fontSize: 47, lineHeight: 49, letterSpacing: 1.2 },
  heroBody: { color: "#FFFFFFD1", fontFamily: theme.type.body, fontSize: 13, lineHeight: 19 },
  scoreRow: { marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 9 },
  score: { color: "#fff", fontFamily: theme.type.display, fontSize: 58, lineHeight: 59 },
  scoreLabel: { color: "#FFFFFFB5", fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1, marginBottom: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", minHeight: 92, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: "space-between" },
  metricValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 33 },
  metricLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: .8 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1.2 },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 34, lineHeight: 38 },
  dayList: { gap: 10 },
  dayCard: { padding: 15, borderRadius: 17, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 9 },
  dayTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayDate: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13 },
  dayPoints: { color: theme.colors.success, fontFamily: theme.type.body, fontWeight: "900", fontSize: 11 },
  negative: { color: theme.colors.danger },
  track: { height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: theme.colors.border },
  fill: { height: 8, borderRadius: 999, backgroundColor: theme.colors.brand },
  fillPerfect: { backgroundColor: theme.colors.accent },
  dayMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10 },
  muted: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 13 },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 13 },
});
