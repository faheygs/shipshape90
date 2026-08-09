import { useAppDialog } from "@shipshape/ui-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { createChallenge } from "../challenges/challengeRepository";
import { challengeKeys, useChallenges } from "../challenges/useChallenges";
import { closeRealtimeConnection, refreshRealtimeAuthorization } from "../realtime/realtimeClient";
import { buildCreateChallengeInput, dateValue, type ChallengeDraftSnapshot } from "./challengeCreationModel";

interface PublisherOptions {
  draft: ChallengeDraftSnapshot;
  today: Date;
  isValid: boolean;
  onError: (message: string | null) => void;
}

export function useChallengePublisher({ draft, today, isValid, onError }: PublisherOptions) {
  const queryClient = useQueryClient();
  const { showDialog } = useAppDialog();
  const challenges = useChallenges();
  const [saving, setSaving] = useState(false);

  const save = async (allowAutoSwitch = false, replaceExistingQueue = false) => {
    if (!isValid) return;
    setSaving(true);
    onError(null);
    try {
      const { challengeId, status } = await createChallenge(buildCreateChallengeInput(draft, allowAutoSwitch, replaceExistingQueue));
      try { await refreshRealtimeAuthorization(); } catch { closeRealtimeConnection(); }
      await queryClient.invalidateQueries({ queryKey: challengeKeys.all });
      if (status === "active") {
        showDialog({
          icon: "trophy",
          eyebrow: "CHALLENGE LIVE",
          title: "Let's get to work.",
          message: "You're in. Complete your Start check-in to unlock today's tasks.",
          actions: [{ label: "Open challenge", onPress: () => router.replace(`/challenge/${challengeId}`) }],
        });
      } else {
        showDialog({
          icon: "trophy",
          eyebrow: "CHALLENGE PUBLISHED",
          title: "You're hosting—and you're in.",
          message: `This is now your one queued challenge. You'll join automatically when it starts${allowAutoSwitch ? ", switching from your current challenge if necessary" : ""}.`,
          actions: [{ label: "Open host controls", onPress: () => router.replace({ pathname: "/manage-challenge/[id]", params: { id: challengeId } }) }],
        });
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "We couldn't publish that challenge.");
    } finally {
      setSaving(false);
    }
  };

  const prepareCreate = () => {
    const currentChallenge = challenges.data?.find((challenge) => ["pending", "active"].includes(challenge.membershipStatus));
    const startsNow = draft.startsOn <= dateValue(today);
    const queuedChallenge = startsNow ? undefined : challenges.data?.find((challenge) => challenge.isQueued);
    const overlapsCurrent = Boolean(currentChallenge && currentChallenge.endsOn >= draft.startsOn);
    if (!overlapsCurrent && !queuedChallenge) {
      void save();
      return;
    }
    const effects = [
      queuedChallenge ? `${queuedChallenge.name} will be removed from Up next.` : null,
      overlapsCurrent && currentChallenge
        ? startsNow
          ? `${currentChallenge.name} will be left immediately and prize eligibility will be forfeited.`
          : `${currentChallenge.name} will be left when this challenge starts if it is still active.`
        : null,
    ].filter(Boolean).join(" ");
    showDialog({
      icon: "alert",
      eyebrow: "HOSTS PARTICIPATE",
      title: startsNow && overlapsCurrent ? "This switches challenges now." : "Make this your next challenge?",
      message: `Creating a challenge automatically enters you as a participant. ${effects}`,
      dismissible: true,
      actions: [
        { label: "Go back", variant: "secondary" },
        {
          label: startsNow && overlapsCurrent ? "Create & switch now" : "Create & schedule",
          variant: overlapsCurrent ? "danger" : "primary",
          onPress: () => void save(overlapsCurrent, Boolean(queuedChallenge)),
        },
      ],
    });
  };

  return { prepareCreate, saving };
}
