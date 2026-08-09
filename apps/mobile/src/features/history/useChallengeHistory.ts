import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { challengeActivityKeys } from "../activity/useChallengeActivity";
import { leaderboardKeys } from "../leaderboard/useChallengeLeaderboard";
import { todayTaskKeys } from "../tasks/useTodayTasks";
import { amendChallengeDay, listChallengeDay, listChallengeHistory, listMyChallengeHistory } from "./challengeHistoryRepository";

export const challengeHistoryKeys = {
  all: ["challenge-history"] as const,
  list: (challengeId: string) => ["challenge-history", challengeId] as const,
  day: (challengeId: string, localDate: string) => ["challenge-history", challengeId, localDate] as const,
  summary: ["challenge-history-summary"] as const,
};

export function useMyChallengeHistory() {
  return useQuery({ queryKey: challengeHistoryKeys.summary, queryFn: listMyChallengeHistory });
}

export function useChallengeHistory(challengeId: string) {
  return useQuery({
    queryKey: challengeHistoryKeys.list(challengeId),
    queryFn: () => listChallengeHistory(challengeId),
    enabled: Boolean(challengeId),
  });
}

export function useChallengeHistoryDay(challengeId: string, localDate: string | null) {
  return useQuery({
    queryKey: challengeHistoryKeys.day(challengeId, localDate ?? "none"),
    queryFn: () => listChallengeDay(challengeId, localDate as string),
    enabled: Boolean(challengeId && localDate),
  });
}

export function useAmendChallengeDay(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { localDate: string; occurrenceIds: string[] }) => amendChallengeDay({ challengeId, ...input }),
    onSettled: async (_data, _error, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.list(challengeId) }),
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.day(challengeId, input.localDate) }),
        queryClient.invalidateQueries({ queryKey: todayTaskKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.streak(challengeId) }),
        queryClient.invalidateQueries({ queryKey: challengeActivityKeys.detail(challengeId) }),
      ]);
    },
  });
}
