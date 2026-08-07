import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { closeRealtimeConnection } from "../realtime/realtimeClient";
import { challengeHistoryKeys } from "../history/useChallengeHistory";
import {
  joinChallenge,
  leaveChallenge,
  listChallenges,
  listChallengeTasks,
  setChallengeSaved,
  setChallengeQueued,
  switchChallenge,
  type ChallengeListItem,
} from "./challengeRepository";

export const challengeKeys = { all: ["challenges"] as const };

export function useChallenges() {
  return useQuery({ queryKey: challengeKeys.all, queryFn: listChallenges });
}

export function useChallengeTasks(challengeId: string) {
  return useQuery({
    queryKey: ["challenge-tasks", challengeId],
    queryFn: () => listChallengeTasks(challengeId),
    enabled: Boolean(challengeId),
  });
}

export function useJoinChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, inviteCode }: { challengeId: string; inviteCode?: string }) => joinChallenge(challengeId, inviteCode),
    onSuccess: () => {
      closeRealtimeConnection();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary }),
      ]);
    },
  });
}

export function useSwitchChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, inviteCode }: { challengeId: string; inviteCode?: string }) => switchChallenge(challengeId, inviteCode),
    onSuccess: () => {
      closeRealtimeConnection();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary }),
      ]);
    },
  });
}

export function useSetChallengeSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, isSaved }: { challengeId: string; isSaved: boolean }) => setChallengeSaved(challengeId, isSaved),
    onMutate: async ({ challengeId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: challengeKeys.all });
      const previous = queryClient.getQueryData<ChallengeListItem[]>(challengeKeys.all);
      queryClient.setQueryData<ChallengeListItem[]>(challengeKeys.all, (current) =>
        current?.map((challenge) => challenge.id === challengeId ? { ...challenge, isSaved } : challenge),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(challengeKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
  });
}

export function useSetChallengeQueued() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, isQueued, allowAutoSwitch = false }: { challengeId: string; isQueued: boolean; allowAutoSwitch?: boolean }) =>
      setChallengeQueued(challengeId, isQueued, allowAutoSwitch),
    onMutate: async ({ challengeId, isQueued }) => {
      await queryClient.cancelQueries({ queryKey: challengeKeys.all });
      const previous = queryClient.getQueryData<ChallengeListItem[]>(challengeKeys.all);
      queryClient.setQueryData<ChallengeListItem[]>(challengeKeys.all, (current) =>
        current?.map((challenge) => challenge.id === challengeId
          ? { ...challenge, isQueued, queueStatus: isQueued ? "queued" : null, isSaved: isQueued || challenge.isSaved }
          : challenge),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(challengeKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
  });
}

export function useLeaveChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveChallenge,
    onSuccess: () => {
      closeRealtimeConnection();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
        queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary }),
      ]);
    },
  });
}
