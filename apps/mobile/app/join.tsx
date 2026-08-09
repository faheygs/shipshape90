import { BackButton, Button, Icon, theme, useAppDialog } from "@shipshape/ui-mobile";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveInvite, type ChallengeListItem } from "../src/features/challenges/challengeRepository";
import { useChallenges, useJoinChallenge, useRequestPrivateChallengeJoin, useSwitchChallenge } from "../src/features/challenges/useChallenges";
import { AppKeyboardToolbar } from "../src/components/AppKeyboardToolbar";

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function JoinByCodeScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const { showDialog } = useAppDialog();
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<ChallengeListItem | null>(null);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const challenges = useChallenges();
  const join = useJoinChallenge();
  const switcher = useSwitchChallenge();
  const unlock = useRequestPrivateChallengeJoin();
  const active = challenges.data?.find((item) => item.membershipStatus === "active" || item.membershipStatus === "pending");
  const normalized = code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
  const isUpcoming = Boolean(challenge && challenge.startsOn > localDateKey());

  const find = async () => {
    if (normalized.length < 6) return;
    setFinding(true);
    setError(null);
    try {
      const result = await resolveInvite(normalized);
      if (!result || (challengeId && result.id !== challengeId)) throw new Error("That code does not unlock this challenge.");
      setChallenge(result);
    } catch (caught) {
      setChallenge(null);
      setError(caught instanceof Error ? caught.message : "We couldn’t find that invite.");
    } finally {
      setFinding(false);
    }
  };

  const handleJoined = () => showDialog({
    icon: "trophy",
    eyebrow: "YOU’RE IN",
    title: "Time to show up.",
    message: `${challenge?.name ?? "This challenge"} is now your active challenge.`,
    actions: [{ label: "Open challenge", onPress: () => router.replace(`/challenge/${challenge?.id}`) }],
  });
  const handleError = (caught: Error) => setError(caught.message || "We couldn’t join that challenge.");
  const joinWithCode = (switchCurrent = false) => {
    if (!challenge) return;
    const mutation = switchCurrent ? switcher : join;
    mutation.mutate({ challengeId: challenge.id, inviteCode: normalized }, { onSuccess: handleJoined, onError: handleError });
  };
  const submit = () => {
    if (!challenge) return;
    if (isUpcoming) {
      unlock.mutate(
        { challengeId: challenge.id, inviteCode: normalized },
        {
          onSuccess: () => showDialog({
            icon: "check",
            eyebrow: "ACCESS UNLOCKED",
            title: "You have the key.",
            message: `${challenge.name} is unlocked and saved. Open it now to queue your spot for ${new Date(`${challenge.startsOn}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`,
            actions: [{ label: "Queue your spot", onPress: () => router.replace(`/challenge-detail/${challenge.id}`) }],
          }),
          onError: handleError,
        },
      );
      return;
    }
    if (active && active.id !== challenge.id) {
      showDialog({
        icon: "alert",
        eyebrow: "THIS CANNOT BE UNDONE",
        title: `Leave ${active.name}?`,
        message: `To join ${challenge.name}, you’ll leave ${active.name}, forfeit any prize, and you can’t rejoin it later.`,
        dismissible: true,
        actions: [
          { label: "Keep current challenge", variant: "secondary" },
          { label: "Leave & join", onPress: () => joinWithCode(true) },
        ],
      });
      return;
    }
    joinWithCode(false);
  };

  const busy = finding || join.isPending || switcher.isPending || unlock.isPending;
  return <SafeAreaView style={styles.safe}><View style={styles.flex}><KeyboardAwareScrollView bottomOffset={62} contentContainerStyle={styles.content} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <BackButton onPress={() => router.back()}/>
    <View style={styles.copy}><Text style={styles.eyebrow}>PRIVATE CHALLENGE</Text><Text style={styles.title}>Enter your invite.</Text><Text style={styles.subtitle}>Invite codes are 6–12 letters and numbers.</Text></View>
    <TextInput value={normalized} onChangeText={(value) => { setCode(value); setChallenge(null); setError(null); }} autoCapitalize="characters" autoCorrect={false} placeholder="ABC123" placeholderTextColor={theme.colors.textMuted} maxLength={12} returnKeyType="go" onSubmitEditing={find} style={styles.input}/>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {challenge ? <View style={styles.preview}><View style={styles.previewTop}><View style={styles.lockBadge}><Icon name="lock" size={17} color={theme.colors.brandStrong}/></View><Text style={styles.challengeName}>{challenge.name}</Text></View><Text style={styles.description}>{challenge.description}</Text><View style={styles.meta}><Text style={styles.metaText}>{challenge.participantCount} members</Text><Text style={styles.metaText}>{challenge.startsOn} → {challenge.endsOn}</Text></View>{challenge.prizeDescription ? <Text style={styles.prize}>{challenge.prizeDescription}</Text> : null}</View> : null}
    {challenge ? <Button loading={busy} onPress={submit}>{isUpcoming ? "Unlock access" : active && active.id !== challenge.id ? "Switch to this challenge" : "Join this challenge"}</Button> : <Button disabled={normalized.length < 6} loading={finding} onPress={find}>Find challenge</Button>}
    <View style={styles.commitment}><Icon name="lock" size={18} color={theme.colors.brandStrong}/><Text style={styles.commitmentText}>{isUpcoming ? "Unlocking a future challenge saves your access without changing your current challenge." : "You can have one active challenge. Switching forfeits prize eligibility in the challenge you leave."}</Text></View>
  </KeyboardAwareScrollView></View><AppKeyboardToolbar /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas }, flex: { flex: 1 }, content: { flexGrow: 1, padding: 24, paddingBottom: 48, gap: 16 }, copy: { gap: 8, marginTop: 24, marginBottom: 8 }, eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 }, title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 49, lineHeight: 51, letterSpacing: 1.3 }, subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 15 },
  input: { minHeight: 64, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 24, letterSpacing: 5, textAlign: "center" }, error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 12 }, preview: { padding: 18, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 10 }, previewTop: { flexDirection: "row", alignItems: "center", gap: 10 }, lockBadge: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft }, challengeName: { flex: 1, color: theme.colors.text, fontFamily: theme.type.display, fontSize: 33, letterSpacing: 1 }, description: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 19 }, meta: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }, metaText: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 11 }, prize: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 13, backgroundColor: theme.colors.accentSoft, padding: 10, borderRadius: 10 }, commitment: { flexDirection: "row", gap: 9, padding: 13, borderRadius: 14, backgroundColor: theme.colors.brandSoft }, commitmentText: { flex: 1, color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 11, lineHeight: 17 },
});
