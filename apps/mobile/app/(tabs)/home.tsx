import { Icon, ProgressRing, theme } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChallengeHistoryCard } from "../../src/components/ChallengeHistoryCard";
import { useAuth } from "../../src/features/auth/AuthProvider";
import { getAvatarUrl } from "../../src/features/auth/authRepository";
import { useChallenges } from "../../src/features/challenges/useChallenges";
import { useMyChallengeHistory } from "../../src/features/history/useChallengeHistory";
import { useChallengeLeaderboard, useMyPerfectDayStreak } from "../../src/features/leaderboard/useChallengeLeaderboard";
import { useTodayTasks } from "../../src/features/tasks/useTodayTasks";

const localDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
};

const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function HomeScreen() {
  const { profile } = useAuth();
  const challenges = useChallenges();
  const active = challenges.data?.find((challenge) => challenge.membershipStatus === "active");
  const hosted = (challenges.data ?? []).filter((challenge) => challenge.isOwner && !["complete", "archived"].includes(challenge.challengeStatus));
  const next = challenges.data?.find((challenge) => challenge.isQueued)
    ?? challenges.data?.find((challenge) => challenge.isSaved && challenge.membershipStatus === "none" && challenge.startsOn > localDateKey());
  const today = useTodayTasks(active?.id ?? "");
  const leaderboard = useChallengeLeaderboard(active?.id ?? "");
  const streak = useMyPerfectDayStreak(active?.id ?? "");
  const history = useMyChallengeHistory();
  const tasks = today.data ?? [];
  const done = tasks.filter((task) => task.status === "complete" || task.status === "pending_review").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const me = leaderboard.data?.find((entry) => entry.isCurrentUser);
  const initials = profile?.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS";
  const avatarUrl = getAvatarUrl(profile?.avatarPath ?? null);
  const past = history.data ?? [];
  const allTimePoints = past.reduce((sum, item) => sum + item.totalPoints, 0) + (me?.totalPoints ?? 0);
  const allTimePerfectDays = past.reduce((sum, item) => sum + item.perfectDays, 0) + (me?.perfectDays ?? 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</Text>
            <Text style={styles.title}>{greeting()}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            hitSlop={8}
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.avatarPressed]}
          >
            {avatarUrl
              ? <Image accessibilityIgnoresInvertColors source={{ uri: avatarUrl }} style={styles.avatarImage} />
              : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{initials}</Text></View>}
          </Pressable>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Today</Text>{active ? <Text style={styles.sectionMeta}>LIVE</Text> : null}</View>
        {active ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${active.name}. ${done} of ${tasks.length} tasks complete. ${me?.totalPoints ?? 0} points.`} onPress={() => router.push(`/challenge/${active.id}`)} style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}>
            <View style={styles.activeTop}><View style={styles.livePill}><View style={styles.liveDot}/><Text style={styles.liveText}>ACTIVE CHALLENGE</Text></View><Icon name="arrow-right" color={theme.colors.brandStrong}/></View>
            <Text style={styles.challengeTitle}>{active.name}</Text>
            <View style={styles.performanceStrip}>
              <View style={styles.performanceStat}><Text style={styles.performanceValue}>{me?.totalPoints ?? 0}</Text><Text style={styles.performanceLabel}>POINTS</Text></View>
              <View style={styles.performanceDivider}/>
              <View style={styles.performanceStat}><Text style={styles.performanceValue}>{me?.rank ? `#${me.rank}` : "—"}</Text><Text style={styles.performanceLabel}>RANK</Text></View>
              <View style={styles.performanceDivider}/>
              <View style={styles.performanceStat}><Text style={styles.performanceValue}>{streak.data ?? 0}</Text><Text style={styles.performanceLabel}>STREAK</Text></View>
            </View>
            <View style={styles.challengeBody}>
              <ProgressRing value={progress} caption={`${done} of ${tasks.length} complete`} size={104}/>
              <View style={styles.taskPreview}>
                {tasks.slice(0, 3).map((task) => {
                  const complete = task.status === "complete" || task.status === "pending_review";
                  const missed = task.status === "missed";
                  return <View key={task.occurrenceId} style={[styles.taskRow, complete && styles.taskRowComplete, missed && styles.taskRowMissed]}><Text numberOfLines={1} style={styles.taskText}>{task.title}</Text><Text style={[styles.taskStatus, complete && styles.taskStatusComplete, missed && styles.taskStatusMissed]}>{missed ? "MISSED" : complete ? "DONE" : "OPEN"}</Text></View>;
                })}
                {tasks.length > 3 ? <Text style={styles.moreTasks}>+{tasks.length - 3} more tasks</Text> : null}
                {today.isLoading ? <Text style={styles.moreTasks}>Loading today’s tasks…</Text> : null}
              </View>
            </View>
            <View style={styles.openRow}><Text style={styles.openText}>OPEN TODAY’S TASKS</Text><View style={styles.openIcon}><Icon name="arrow-right" size={18} color={theme.colors.brandStrong}/></View></View>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Explore challenges" onPress={() => router.push("/(tabs)/challenges")} style={({ pressed }) => [styles.noChallenge, pressed && styles.pressed]}><View style={styles.noChallengeCopy}><Text style={styles.noChallengeEyebrow}>READY WHEN YOU ARE</Text><Text style={styles.noChallengeTitle}>Find your next challenge</Text><Text style={styles.noChallengeBody}>Choose one commitment and make it count.</Text></View><Icon name="arrow-right" color={theme.colors.brandStrong}/></Pressable>
        )}

        {hosted.length ? <View style={styles.hostSection}>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Hosting</Text><Text style={styles.sectionMeta}>{hosted.length} {hosted.length === 1 ? "CHALLENGE" : "CHALLENGES"}</Text></View>
          <View style={styles.hostList}>{hosted.map((challenge) => <Pressable key={challenge.id} accessibilityRole="button" accessibilityLabel={`Open host controls for ${challenge.name}`} onPress={() => router.push(`/manage-challenge/${challenge.id}`)} style={({ pressed }) => [styles.hostCard, pressed && styles.pressed]}>
            <View style={styles.hostIcon}><Icon name="trophy" size={21} color={theme.colors.brandStrong}/></View>
            <View style={styles.hostCopy}><Text numberOfLines={1} style={styles.hostTitle}>{challenge.name}</Text><Text style={styles.hostMeta}>{challenge.challengeStatus === "registration" ? `Starts ${shortDate(challenge.startsOn)}` : challenge.challengeStatus.toUpperCase()} · {challenge.participantCount} participants</Text></View>
            <View style={styles.hostAction}><Text style={styles.hostActionText}>HOST</Text><Icon name="arrow-right" size={16} color={theme.colors.brandStrong}/></View>
          </Pressable>)}</View>
        </View> : null}

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Your run</Text><Text style={styles.sectionMeta}>ALL TIME</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open challenge history. ${allTimePoints} all-time points, ${allTimePerfectDays} perfect days, ${past.length} finished challenges.`} onPress={() => router.push("/history")} style={({ pressed }) => [styles.runCard, pressed && styles.pressed]}>
          <View style={styles.runStats}>
            <View style={styles.runStat}><Text style={styles.runValue}>{allTimePoints}</Text><Text style={styles.runLabel}>POINTS</Text></View>
            <View style={styles.runDivider}/>
            <View style={styles.runStat}><Text style={styles.runValue}>{allTimePerfectDays}</Text><Text style={styles.runLabel}>PERFECT DAYS</Text></View>
            <View style={styles.runDivider}/>
            <View style={styles.runStat}><Text style={styles.runValue}>{past.length}</Text><Text style={styles.runLabel}>FINISHED</Text></View>
          </View>
          <View style={styles.runFooter}><View><Text style={styles.runTitle}>Challenge history</Text><Text style={styles.runBody}>See every result and daily performance.</Text></View><View style={styles.runArrow}><Icon name="arrow-right" size={19} color={theme.colors.brandStrong}/></View></View>
        </Pressable>

        {next ? <View style={styles.nextSection}>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Up next</Text><Text style={styles.sectionMeta}>{next.isQueued ? "QUEUED" : "SAVED"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${next.name}. ${next.isQueued ? "Queued to auto-join" : "Saved"}. Starts ${shortDate(next.startsOn)}.`} onPress={() => router.push(`/challenge-detail/${next.id}`)} style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}>
            <View style={styles.nextIcon}><Icon name={next.isQueued ? "calendar" : "heart"} filled={!next.isQueued} color={theme.colors.brandStrong}/></View>
            <View style={styles.nextCopy}><Text style={styles.nextTitle}>{next.name}</Text><Text style={styles.nextMeta}>{next.isQueued ? "Auto-joins" : "Starts"} {shortDate(next.startsOn)}</Text></View>
            <Icon name="arrow-right" color={theme.colors.textSecondary}/>
          </Pressable>
        </View> : null}

        {past[0] ? <View style={styles.recentSection}>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Latest result</Text><Text style={styles.sectionMeta}>RECENT</Text></View>
          <ChallengeHistoryCard compact item={past[0]} onPress={() => router.push({ pathname: "/history/[id]", params: { id: past[0].challengeId } })} />
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: 24, paddingBottom: 52, gap: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  headerCopy: { flex: 1 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.4 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 42, lineHeight: 46, letterSpacing: 1.1 },
  avatarButton: { width: 48, height: 48, padding: 2, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  avatarImage: { width: "100%", height: "100%", borderRadius: 21, backgroundColor: theme.colors.brandSoft },
  avatarFallback: { flex: 1, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brand },
  avatarPressed: { opacity: .78, transform: [{ scale: .96 }] },
  avatarText: { color: "#fff", fontFamily: theme.type.body, fontWeight: "800" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 19 },
  sectionMeta: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  activeCard: { padding: 20, borderRadius: 26, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft, gap: 8, shadowColor: theme.colors.brand, shadowOpacity: .08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  pressed: { opacity: .88, transform: [{ scale: .995 }] },
  activeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.surface },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.brand },
  liveText: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1.1 },
  challengeTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 45, lineHeight: 48, letterSpacing: 1.4 },
  performanceStrip: { minHeight: 62, flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: theme.colors.surface },
  performanceStat: { flex: 1, alignItems: "center", gap: 2 },
  performanceDivider: { width: 1, height: 30, backgroundColor: theme.colors.border },
  performanceValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 25, lineHeight: 27 },
  performanceLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: .7 },
  challengeBody: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 10 },
  taskPreview: { flex: 1, gap: 7 },
  taskRow: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: theme.colors.surface },
  taskRowComplete: { backgroundColor: theme.colors.accentSoft },
  taskRowMissed: { backgroundColor: theme.colors.dangerSoft },
  taskText: { flex: 1, color: theme.colors.text, fontFamily: theme.type.body, fontSize: 10, fontWeight: "700" },
  taskStatus: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: .5 },
  taskStatusComplete: { color: theme.colors.textSecondary },
  taskStatusMissed: { color: theme.colors.danger },
  moreTasks: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 10, marginLeft: 9 },
  openRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  openText: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1.1 },
  openIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  noChallenge: { minHeight: 140, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  noChallengeCopy: { flex: 1, gap: 4 },
  noChallengeEyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  noChallengeTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 18 },
  noChallengeBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 13 },
  hostSection: { gap: 12 },
  hostList: { gap: 10 },
  hostCard: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.surface },
  hostIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  hostCopy: { flex: 1, gap: 3 },
  hostTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  hostMeta: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 10 },
  hostAction: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: theme.colors.brandSoft },
  hostActionText: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 8, letterSpacing: .8 },
  runCard: { padding: 17, borderRadius: 22, backgroundColor: theme.colors.brandStrong, gap: 16 },
  runStats: { minHeight: 66, flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: "#FFFFFF14" },
  runStat: { flex: 1, alignItems: "center", gap: 2 },
  runDivider: { width: 1, height: 30, backgroundColor: "#FFFFFF28" },
  runValue: { color: "#fff", fontFamily: theme.type.display, fontSize: 27 },
  runLabel: { color: "#FFFFFFA8", fontFamily: theme.type.body, fontWeight: "900", fontSize: 7, letterSpacing: .7 },
  runFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  runTitle: { color: "#fff", fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 },
  runBody: { color: "#FFFFFFB8", fontFamily: theme.type.body, fontSize: 11, marginTop: 2 },
  runArrow: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent },
  nextSection: { gap: 12 },
  nextCard: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 13, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  nextIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft },
  nextCopy: { flex: 1, gap: 3 },
  nextTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  nextMeta: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11 },
  recentSection: { gap: 12 },
});
