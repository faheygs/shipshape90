import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { leaderboardKeys } from "../leaderboard/useChallengeLeaderboard";
import { bodyProgressKeys } from "../progress/useBodyProgress";
import { todayTaskKeys } from "../tasks/useTodayTasks";
import { listMyChallengeCheckpoints, saveChallengeCheckin } from "./checkinRepository";

export const challengeCheckinKeys = {
  detail: (challengeId: string) => ["challenge-checkpoints", challengeId] as const,
};

export function useChallengeCheckins(challengeId: string) {
  return useQuery({
    queryKey: challengeCheckinKeys.detail(challengeId),
    queryFn: () => listMyChallengeCheckpoints(challengeId),
    enabled: Boolean(challengeId),
  });
}

export function useSaveChallengeCheckin(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveChallengeCheckin,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: challengeCheckinKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: bodyProgressKeys.list(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: todayTaskKeys.detail(challengeId) }),
      ]);
    },
  });
}
