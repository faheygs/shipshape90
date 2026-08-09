import { BackButton, Button, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import { getShipShapePointRules } from "@shipshape/domain";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useChallenges,
  useChallengeTasks,
  useJoinChallenge,
  useRequestPrivateChallengeJoin,
  useSetChallengeQueued,
  useSwitchChallenge,
} from "../../src/features/challenges/useChallenges";

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challenges = useChallenges();
  const challenge = challenges.data?.find((item) => item.id === id);
  const privatePreview = Boolean(
    challenge?.visibility === "private"
    && !challenge.isOwner
    && challenge.membershipStatus === "none"
    && !["approved", "joined"].includes(challenge.joinRequestStatus ?? ""),
  );
  const tasks = useChallengeTasks(privatePreview ? "" : id ?? "");
  const join = useJoinChallenge();
  const switcher = useSwitchChallenge();
  const queue = useSetChallengeQueued();
  const requestAccess = useRequestPrivateChallengeJoin();
  const { showDialog } = useAppDialog();
  const active = challenges.data?.find((item) => item.membershipStatus === "active" || item.membershipStatus === "pending");
  const queuedElsewhere = challenges.data?.find((item) => item.id !== id && item.isQueued);
  const blockedByActive = Boolean(active && active.id !== id);
  const pointRules = getShipShapePointRules(tasks.data?.length ?? 0);

  if (!challenge) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><BackButton onPress={() => router.back()} /><Text style={styles.loadingText}>{challenges.isLoading ? "Loading challenge…" : "Challenge not found."}</Text></View></SafeAreaView>;
  }

  const isUpcoming = challenge.startsOn > localDateKey();
  const startLabel = new Date(`${challenge.startsOn}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const handleJoinSuccess = () => showDialog({
    icon: "trophy",
    eyebrow: challenge.joinPolicy === "approval" ? "REQUEST SENT" : "YOU’RE IN",
    title: challenge.joinPolicy === "approval" ? "The creator has it." : "Time to show up.",
    message: challenge.joinPolicy === "approval" ? "The creator will review your request." : "This is now your active challenge.",
    actions: [{ label: "Continue", onPress: () => router.replace(challenge.joinPolicy === "approval" ? "/(tabs)/challenges" : `/challenge/${challenge.id}`) }],
  });
  const handleJoinError = (error: Error) => showDialog({ icon: "alert", title: "Couldn’t join.", message: error.message || "Please try again." });
  const switchNow = () => switcher.mutate({ challengeId: challenge.id }, { onSuccess: handleJoinSuccess, onError: handleJoinError });
  const joinNow = () => {
    if (blockedByActive && active) {
      showDialog({
        icon: "alert",
        eyebrow: "THIS CANNOT BE UNDONE",
        title: `Leave ${active.name}?`,
        message: `To join ${challenge.name}, you’ll immediately leave ${active.name}, forfeit any prize, and you can’t rejoin it later. Your submitted history stays final.`,
        dismissible: true,
        actions: [
          { label: "Keep current challenge", variant: "secondary" },
          { label: "Leave & join", onPress: switchNow },
        ],
      });
      return;
    }
    join.mutate({ challengeId: challenge.id }, { onSuccess: handleJoinSuccess, onError: handleJoinError });
  };
  const queueNow = (allowAutoSwitch: boolean, replaceExisting = false) => queue.mutate(
    { challengeId: challenge.id, isQueued: true, allowAutoSwitch, replaceExisting },
    {
      onSuccess: () => showDialog({
        icon: "check",
        eyebrow: "QUEUED FOR START",
        title: "Your spot is lined up.",
        message: `We’ll automatically join you when ${challenge.name} starts on ${startLabel} in your profile timezone.`,
      }),
      onError: (error) => showDialog({ icon: "alert", title: "Couldn’t join the queue.", message: error.message || "Please try again." }),
    },
  );
  const requestQueue = () => {
    if ((blockedByActive && active) || queuedElsewhere) {
      const replacementCopy = queuedElsewhere ? `${queuedElsewhere.name} will be removed from Up next. ` : "";
      const switchCopy = blockedByActive && active
        ? `If you’re still in ${active.name} when this starts on ${startLabel}, ShipShape will leave it, forfeit any prize, and you won’t be able to rejoin it.`
        : `You’ll join automatically when ${challenge.name} starts on ${startLabel}.`;
      showDialog({
        icon: "alert",
        eyebrow: "FUTURE SWITCH APPROVAL",
        title: queuedElsewhere ? `Replace ${queuedElsewhere.name}?` : `Queue ${challenge.name}?`,
        message: `${replacementCopy}${switchCopy}`,
        dismissible: true,
        actions: [
          { label: queuedElsewhere ? "Keep current queue" : "Keep current challenge", variant: "secondary" },
          { label: blockedByActive ? "Queue & approve switch" : "Replace queue", onPress: () => queueNow(blockedByActive, Boolean(queuedElsewhere)) },
        ],
      });
      return;
    }
    queueNow(false);
  };
  const leaveQueue = () => queue.mutate(
    { challengeId: challenge.id, isQueued: false },
    { onError: (error) => showDialog({ icon: "alert", title: "Couldn’t leave the queue.", message: error.message || "Please try again." }) },
  );
  const requestPrivateAccess = () => requestAccess.mutate(
    { challengeId: challenge.id },
    {
      onSuccess: () => showDialog({
        icon: "check",
        eyebrow: "REQUEST SENT",
        title: "The host has it.",
        message: "This does not affect your current challenge. We’ll notify you when the host decides.",
        actions: [{ label: "Done" }],
      }),
      onError: (error) => showDialog({ icon: "alert", title: "Couldn’t send request.", message: error.message || "Please try again." }),
    },
  );

  const privateAccessAction = <View style={styles.privateActions}>
        <Button variant="secondary" onPress={() => router.push({ pathname: "/join", params: { challengeId: challenge.id } })}>Enter code</Button>
        <Button disabled={["requested", "declined"].includes(challenge.joinRequestStatus ?? "") || requestAccess.isPending} loading={requestAccess.isPending} onPress={requestPrivateAccess}>{challenge.joinRequestStatus === "requested" ? "Request pending" : challenge.joinRequestStatus === "declined" ? "Request declined" : "Request to join"}</Button>
      </View>;

  const standardAction = challenge.membershipStatus === "active"
    ? <Button onPress={() => router.replace(`/challenge/${challenge.id}`)}>Open active challenge</Button>
    : challenge.membershipStatus === "pending"
      ? <Button disabled>Request pending</Button>
      : isUpcoming
        ? challenge.queueStatus === "blocked"
          ? <View style={styles.queueActions}><Button disabled={queue.isPending} loading={queue.isPending} onPress={requestQueue}>Approve switch at start</Button><Button variant="secondary" disabled={queue.isPending} onPress={leaveQueue}>Leave queue</Button></View>
          : challenge.isQueued
            ? <Button variant="secondary" disabled={queue.isPending} loading={queue.isPending} onPress={leaveQueue}>Leave queue</Button>
            : <Button disabled={queue.isPending} loading={queue.isPending} onPress={requestQueue}>Queue for start</Button>
        : <Button disabled={join.isPending || switcher.isPending} loading={join.isPending || switcher.isPending} onPress={joinNow}>{blockedByActive ? "Switch to this challenge" : challenge.joinPolicy === "approval" ? "Request to join" : "Join challenge"}</Button>;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.top}><BackButton onPress={() => router.back()} /><View style={styles.topActions}><View style={styles.visibility}>{challenge.visibility === "private" ? <Icon name="lock" size={12} color={theme.colors.brandStrong}/> : null}<Text style={styles.visibilityText}>{challenge.visibility.toUpperCase()}</Text></View>{challenge.isOwner ? <Button size="sm" variant="secondary" onPress={() => router.push(`/manage-challenge/${challenge.id}`)}>Host controls</Button> : null}</View></View>
    <View style={styles.cover}><Text style={styles.title}>{challenge.name}</Text><Text style={styles.description}>{challenge.description}</Text></View>
    <View style={styles.stats}><View style={styles.stat}><Text style={styles.statValue}>{challenge.participantCount}</Text><Text style={styles.statLabel}>MEMBERS</Text></View><View style={styles.stat}><Text style={styles.statValue}>{Math.max(1, Math.round((new Date(challenge.endsOn).getTime() - new Date(challenge.startsOn).getTime()) / 86400000) + 1)}</Text><Text style={styles.statLabel}>DAYS</Text></View><View style={styles.stat}><Text style={styles.statValue}>{challenge.visibility === "private" ? "LOCK" : "OPEN"}</Text><Text style={styles.statLabel}>ACCESS</Text></View></View>

    {privatePreview ? <View style={styles.privateGate}><View style={styles.privateGateIcon}><Icon name="lock" size={25} color={theme.colors.brandStrong}/></View><Text style={styles.privateGateEyebrow}>PRIVATE CHALLENGE</Text><Text style={styles.privateGateTitle}>{challenge.joinRequestStatus === "declined" ? "Request declined." : "Unlock the full challenge."}</Text><Text style={styles.privateGateBody}>{challenge.joinRequestStatus === "requested" ? "Your request is with the host. If you receive the code while you wait, you can unlock access instantly." : challenge.joinRequestStatus === "declined" ? "The host closed this request. You can still enter a valid private code if they share one with you." : "Enter the host’s private code for instant access, or ask the host to approve you."}</Text></View> : <>
      <View style={styles.scoring}><Text style={styles.prizeLabel}>WINNING CONDITION</Text><Text style={styles.prizeValue}>Highest ShipShape Points</Text><Text style={styles.scoringBody}>+1 per completed task and −3 per missed task. With {tasks.data?.length ?? 0} daily tasks, a perfect day adds +{pointRules.perfectDayBonus} and every 7-day perfect streak adds +{pointRules.sevenDayStreakBonus}.{challenge.bonusMetric === "none" ? "" : ` ${challenge.bonusMetric === "weight" ? "Weight" : "Body-fat"} ${challenge.bonusCalculation === "percentage" ? "percentage" : "total"} change adds bonus points.`}</Text></View>
      {challenge.prizeDescription ? <View style={styles.prize}><Icon name="trophy" color={theme.colors.text}/><View><Text style={styles.prizeLabel}>PRIZE</Text><Text style={styles.prizeValue}>{challenge.prizeDescription}</Text></View></View> : null}
      <Text style={styles.sectionTitle}>What you’ll do</Text><View style={styles.tasks}>{(tasks.data ?? []).map((task) => <View key={task.id} style={styles.task}><View style={styles.taskDot}/><View style={styles.taskCopy}><Text style={styles.taskTitle}>{task.title}</Text><Text style={styles.taskMeta}>{task.targetValue ? `${task.targetValue} ${task.unit ?? ""}` : task.instructions}</Text></View><Text style={styles.taskPoints}>+{task.points} POINT</Text></View>)}{tasks.isLoading ? <Text style={styles.muted}>Loading challenge tasks…</Text> : null}{!tasks.isLoading && tasks.data?.length === 0 ? <Text style={styles.muted}>The creator’s task list will appear here.</Text> : null}</View>
    </>}

    <View style={styles.commitment}><Icon name="lock" size={20} color={theme.colors.brandStrong}/><View style={styles.commitmentCopy}><Text style={styles.commitmentTitle}>One active challenge at a time</Text><Text style={styles.commitmentBody}>{privatePreview ? "Requesting access or entering a code does not affect the challenge you’re currently in. The rule applies only when you actually join." : "Leaving later forfeits prize eligibility and permanently prevents rejoining this challenge."}</Text></View></View>
    {!privatePreview && isUpcoming ? <View style={[styles.queueNotice, challenge.queueStatus === "blocked" && styles.queueNoticeBlocked]}><Icon name={challenge.queueStatus === "blocked" ? "alert" : "calendar"} size={21} color={challenge.queueStatus === "blocked" ? theme.colors.danger : theme.colors.brandStrong}/><View style={styles.commitmentCopy}><Text style={styles.commitmentTitle}>{challenge.queueStatus === "blocked" ? "Your queue needs approval" : challenge.isQueued ? "You’re queued" : "Starts in your local timezone"}</Text><Text style={styles.commitmentBody}>{challenge.queueStatus === "blocked" ? "Another active challenge is blocking enrollment. Approve the future switch or leave the queue." : challenge.isQueued ? `Auto-join is set for ${startLabel}.` : `Joining opens on ${startLabel}. Queue now and ShipShape will handle it at the start.`}</Text></View></View> : null}
    {privatePreview ? privateAccessAction : standardAction}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, content: { padding: 24, paddingBottom: 48, gap: 22 }, loading: { flex: 1, padding: 24, gap: 24 }, loadingText: { color: theme.colors.textSecondary, fontFamily: theme.type.body },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, topActions: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }, visibility: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: theme.colors.brandSoft }, visibilityText: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  cover: { minHeight: 220, padding: 22, borderRadius: 26, justifyContent: "flex-end", gap: 8, backgroundColor: theme.colors.brandStrong }, title: { color: "#fff", fontFamily: theme.type.display, fontSize: 48, lineHeight: 49, letterSpacing: 1.4 }, description: { color: "#FFFFFFD1", fontFamily: theme.type.body, fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: "row", padding: 18, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, stat: { flex: 1, alignItems: "center", gap: 4 }, statValue: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 28 }, statLabel: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontWeight: "800", fontSize: 8, letterSpacing: .8 },
  privateGate: { alignItems: "center", padding: 24, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft, gap: 8 }, privateGateIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface }, privateGateEyebrow: { marginTop: 5, color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "900", fontSize: 9, letterSpacing: 1.2 }, privateGateTitle: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 36, lineHeight: 39, letterSpacing: .8, textAlign: "center" }, privateGateBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 20, textAlign: "center" }, privateActions: { gap: 10 },
  scoring: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandSoft, gap: 4 }, scoringBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 }, prize: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: 16, backgroundColor: theme.colors.accentSoft }, prizeLabel: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: 1 }, prizeValue: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 16 }, sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 19 },
  tasks: { gap: 12 }, task: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, taskDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent }, taskCopy: { flex: 1 }, taskTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "700", fontSize: 14 }, taskMeta: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11, marginTop: 3 }, taskPoints: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 9, letterSpacing: .8 }, muted: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 13 },
  commitment: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 18, borderRadius: 16, backgroundColor: theme.colors.brandSoft }, queueNotice: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.surface }, queueNoticeBlocked: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }, queueActions: { gap: 10 }, commitmentCopy: { flex: 1, gap: 4 }, commitmentTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 }, commitmentBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
});
