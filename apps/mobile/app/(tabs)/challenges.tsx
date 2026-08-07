import { Button, ChallengeCard, ChoiceChip, theme } from "@shipshape/ui-mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChallengeListItem } from "../../src/features/challenges/challengeRepository";
import { useChallenges, useSetChallengeSaved } from "../../src/features/challenges/useChallenges";

type ExploreFilter = "for-you" | "starting-soon" | "open-now" | "saved";

const filters: { key: ExploreFilter; label: string }[] = [
  { key: "for-you", label: "For you" },
  { key: "starting-soon", label: "Starting soon" },
  { key: "open-now", label: "Open now" },
  { key: "saved", label: "Saved" },
];

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const cardStatus = (challenge: ChallengeListItem, today: string): "active" | "upcoming" | "complete" =>
  challenge.endsOn < today ? "complete" : challenge.startsOn <= today ? "active" : "upcoming";

const dateMeta = (challenge: ChallengeListItem) =>
  `${new Date(`${challenge.startsOn}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(`${challenge.endsOn}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

export default function ChallengesScreen() {
  const [filter, setFilter] = useState<ExploreFilter>("for-you");
  const query = useChallenges();
  const saveChallenge = useSetChallengeSaved();
  const challenges = useMemo(() => query.data ?? [], [query.data]);
  const today = localDateKey();
  const discoverable = useMemo(() => {
    const available = challenges.filter((challenge) =>
      challenge.membershipStatus !== "active"
      && challenge.membershipStatus !== "pending"
      && challenge.endsOn >= today,
    );
    const matching = available.filter((challenge) => {
      if (filter === "starting-soon") return challenge.startsOn > today;
      if (filter === "open-now") return challenge.startsOn <= today;
      if (filter === "saved") return challenge.isSaved;
      return true;
    });
    return [...matching].sort((left, right) => {
      if (filter === "for-you") {
        const leftOpen = left.startsOn <= today ? 0 : 1;
        const rightOpen = right.startsOn <= today ? 0 : 1;
        if (leftOpen !== rightOpen) return leftOpen - rightOpen;
      }
      return left.startsOn.localeCompare(right.startsOn);
    });
  }, [challenges, filter, today]);
  const openChallenge = (challenge: ChallengeListItem) => router.push(`/challenge-detail/${challenge.id}`);
  const emptyCopy = filter === "saved"
    ? { title: "Nothing saved yet", body: "Tap the heart on a challenge you want to come back to." }
    : filter === "open-now"
      ? { title: "No challenges are open now", body: "Check Starting soon for your next chance to compete." }
      : filter === "starting-soon"
        ? { title: "Nothing is starting soon", body: "New challenges will show up here as soon as they are published." }
        : { title: "No public challenges yet", body: "Create the first one from the Create tab, or join with an invite code." };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CHALLENGES</Text>
          <Text style={styles.title}>Find your next win.</Text>
          <Text style={styles.subtitle}>Choose one commitment, then give it everything.</Text>
        </View>

        {query.isLoading ? <Text style={styles.message}>Loading challenges…</Text> : null}
        {query.isError ? (
          <View style={styles.errorCard}>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Challenges couldn’t load</Text>
              <Text style={styles.errorBody}>Check your connection and try again.</Text>
            </View>
            <Button size="sm" variant="secondary" onPress={() => query.refetch()}>Try again</Button>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Explore challenges</Text>
          <View style={styles.filters} accessibilityRole="tablist">
            {filters.map((item) => (
              <ChoiceChip key={item.key} label={item.label} selected={filter === item.key} onPress={() => setFilter(item.key)} />
            ))}
          </View>
          <View style={styles.invite}>
            <View style={styles.inviteCopy}>
              <Text style={styles.inviteTitle}>Have an invite code?</Text>
              <Text style={styles.inviteBody}>Open a private challenge invitation.</Text>
            </View>
            <Button size="sm" variant="secondary" onPress={() => router.push("/join")}>Enter code</Button>
          </View>
          <View style={styles.list}>
            {discoverable.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                title={challenge.name}
                status={cardStatus(challenge, today)}
                meta={dateMeta(challenge)}
                members={`${challenge.participantCount} participants`}
                progress={cardStatus(challenge, today) === "complete" ? 100 : 0}
                isPrivate={challenge.visibility === "private"}
                isSaved={challenge.isSaved}
                isQueued={challenge.isQueued}
                onToggleSaved={() => saveChallenge.mutate({ challengeId: challenge.id, isSaved: !challenge.isSaved })}
                onPress={() => openChallenge(challenge)}
              />
            ))}
            {!query.isLoading && !query.isError && discoverable.length === 0 ? (
              <View style={styles.noResults}>
                <Text style={styles.noResultsTitle}>{emptyCopy.title}</Text>
                <Text style={styles.noResultsBody}>{emptyCopy.body}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 52, gap: 28 },
  header: { gap: 7 },
  eyebrow: { color: theme.colors.brandStrong, fontFamily: theme.type.body, fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontFamily: theme.type.display, fontSize: 50, lineHeight: 52, letterSpacing: 1.2 },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 14, lineHeight: 21, maxWidth: 340 },
  section: { gap: 14 },
  sectionTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 20 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  message: { color: theme.colors.textMuted, fontFamily: theme.type.body, fontSize: 13 },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, backgroundColor: theme.colors.dangerSoft },
  errorCopy: { flex: 1, gap: 3 },
  errorTitle: { color: theme.colors.danger, fontFamily: theme.type.body, fontWeight: "800", fontSize: 14 },
  errorBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12 },
  invite: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 20, backgroundColor: theme.colors.accentSoft },
  inviteCopy: { flex: 1, gap: 3 },
  inviteTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  inviteBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 17 },
  list: { gap: 14 },
  noResults: { padding: 20, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 5 },
  noResultsTitle: { color: theme.colors.text, fontFamily: theme.type.body, fontWeight: "800", fontSize: 15 },
  noResultsBody: { color: theme.colors.textSecondary, fontFamily: theme.type.body, fontSize: 12, lineHeight: 18 },
});
