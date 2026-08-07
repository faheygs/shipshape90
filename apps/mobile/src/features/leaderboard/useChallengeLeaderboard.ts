import { useQuery } from "@tanstack/react-query";
import { getMyPerfectDayStreak, listChallengeLeaderboard } from "./leaderboardRepository";

export const leaderboardKeys = {
  detail: (challengeId: string) => ["challenge-leaderboard", challengeId] as const,
  streak: (challengeId: string) => ["perfect-day-streak", challengeId] as const,
};

export function useChallengeLeaderboard(challengeId: string) {
  return useQuery({
    queryKey: leaderboardKeys.detail(challengeId),
    queryFn: () => listChallengeLeaderboard(challengeId),
    enabled: Boolean(challengeId),
  });
}

export function useMyPerfectDayStreak(challengeId: string) {
  return useQuery({
    queryKey: leaderboardKeys.streak(challengeId),
    queryFn: () => getMyPerfectDayStreak(challengeId),
    enabled: Boolean(challengeId),
  });
}
