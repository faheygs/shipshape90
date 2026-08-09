import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { challengeCheckinKeys } from "../checkins/useChallengeCheckins";
import { challengeKeys, useChallenges } from "../challenges/useChallenges";
import { challengeActivityKeys } from "../activity/useChallengeActivity";
import { challengeHistoryKeys } from "../history/useChallengeHistory";
import { leaderboardKeys } from "../leaderboard/useChallengeLeaderboard";
import { managementKeys } from "../management/useChallengeManagement";
import { notificationKeys } from "../notifications/useNotifications";
import { bodyProgressKeys } from "../progress/useBodyProgress";
import { todayTaskKeys } from "../tasks/useTodayTasks";
import { captureAppError } from "../../lib/telemetry";
import {
  closeRealtimeConnection,
  refreshRealtimeAuthorization,
  subscribeToChallenge,
  subscribeToUserNotifications,
  type ShipShapeRealtimeEvent,
} from "./realtimeClient";
import { RealtimeEventDeduper } from "./realtimeEventDeduper";
import { realtimeInvalidationTargets } from "./realtimeInvalidation";

const capabilityChangingEvents = new Set([
  "challenge.queue_joined",
  "challenge.request_approved",
  "member.challenge_switched",
]);

const isWarningEvent = (eventType: string) => ["declined", "removed", "failed", "blocked", "cancelled"].some((value) => eventType.includes(value));

export function RealtimeBridge() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const challenges = useChallenges(Boolean(profile?.id));
  const [deduper] = useState(() => new RealtimeEventDeduper());
  const challengeIds = useMemo(() => Array.from(new Set((challenges.data ?? [])
    .filter((challenge) => challenge.membershipStatus === "active" || (challenge.isOwner && ["registration", "active", "review"].includes(challenge.challengeStatus)))
    .map((challenge) => challenge.id))).sort(), [challenges.data]);
  const challengeKey = challengeIds.join(",");

  useEffect(() => {
    if (!challengeKey) return;
    let disposed = false;
    const unsubscribers: (() => void)[] = [];

    const handleEvent = (challengeId: string, event: ShipShapeRealtimeEvent) => {
      if (!deduper.shouldProcess(event)) return;
      const targets = realtimeInvalidationTargets(event.type);
      const refreshes = targets.activity
        ? [queryClient.invalidateQueries({ queryKey: challengeActivityKeys.detail(challengeId) })]
        : [];
      if (targets.challenge) refreshes.push(queryClient.invalidateQueries({ queryKey: challengeKeys.all }));
      if (targets.history) refreshes.push(
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary }),
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.list(challengeId) }),
      );
      if (targets.management) refreshes.push(queryClient.invalidateQueries({ queryKey: managementKeys.all(challengeId) }));
      if (targets.score) refreshes.push(
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.streak(challengeId) }),
        queryClient.invalidateQueries({ queryKey: todayTaskKeys.detail(challengeId) }),
      );
      if (targets.progress) refreshes.push(
        queryClient.invalidateQueries({ queryKey: challengeCheckinKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: bodyProgressKeys.list(challengeId) }),
      );
      void Promise.all(refreshes);
    };

    for (const challengeId of challengeKey.split(",")) {
      void subscribeToChallenge(challengeId, (event) => handleEvent(challengeId, event))
        .then((cleanup) => disposed ? cleanup() : unsubscribers.push(cleanup))
        .catch((error) => captureAppError(error, "realtime-challenge-subscribe"));
    }

    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [challengeKey, deduper, queryClient]);

  useEffect(() => {
    if (!profile?.id) {
      deduper.clear();
      closeRealtimeConnection();
      return;
    }
    let disposed = false;
    let unsubscribe: () => void = () => undefined;

    void subscribeToUserNotifications(profile.id, (event) => {
      if (!deduper.shouldProcess(event)) return;
      if (capabilityChangingEvents.has(event.type)) {
        void refreshRealtimeAuthorization().catch((error) => {
          captureAppError(error, "realtime-authorization-refresh");
          closeRealtimeConnection();
        });
      }
      void Haptics.notificationAsync(isWarningEvent(event.type) ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["challenge-management"] }),
      ]);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    }).catch((error) => captureAppError(error, "realtime-notification-subscribe"));

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [deduper, profile?.id, queryClient]);

  return null;
}
