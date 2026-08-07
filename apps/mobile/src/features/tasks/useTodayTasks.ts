import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { communityKeys } from "../community/useCommunityActivity";
import { leaderboardKeys } from "../leaderboard/useChallengeLeaderboard";
import { completeTodayTask, listTodayTasks, submitChallengeDay, type TodayTask } from "./taskRepository";

export const todayTaskKeys = {
  detail: (challengeId: string) => ["today-tasks", challengeId] as const,
};

export function useTodayTasks(challengeId: string) {
  return useQuery({
    queryKey: todayTaskKeys.detail(challengeId),
    queryFn: () => listTodayTasks(challengeId),
    enabled: Boolean(challengeId),
  });
}

export function useSubmitChallengeDay(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceIds: string[]) => submitChallengeDay({ challengeId, occurrenceIds }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: todayTaskKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.streak(challengeId) }),
        queryClient.invalidateQueries({ queryKey: communityKeys.all }),
        queryClient.invalidateQueries({ queryKey: communityKeys.challenge(challengeId) }),
      ]);
    },
  });
}

export function useCompleteTodayTask(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeTodayTask,
    onMutate: async (occurrenceId) => {
      const key = todayTaskKeys.detail(challengeId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TodayTask[]>(key);
      queryClient.setQueryData<TodayTask[]>(key, (current) => current?.map((task) => task.occurrenceId === occurrenceId ? { ...task, status: "complete" } : task));
      return { previous };
    },
    onError: (_error, _occurrenceId, context) => {
      if (context?.previous) queryClient.setQueryData(todayTaskKeys.detail(challengeId), context.previous);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: todayTaskKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: leaderboardKeys.detail(challengeId) }),
        queryClient.invalidateQueries({ queryKey: communityKeys.all }),
        queryClient.invalidateQueries({ queryKey: communityKeys.challenge(challengeId) }),
      ]);
    },
  });
}
