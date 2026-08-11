import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { challengeActivityKeys } from "../activity/useChallengeActivity";
import { leaderboardKeys } from "../leaderboard/useChallengeLeaderboard";
import { completeTodayTask, currentLocalDate, listTodayTasks, submitChallengeDay, type TodayTask } from "./taskRepository";
import { loadTaskSelectionDraft, reconcileTaskSelectionDraft, saveTaskSelectionDraft, taskSelectionDraftKey } from "./taskSelectionDraftRepository";

export const todayTaskKeys = {
  detail: (challengeId: string) => ["today-tasks", challengeId] as const,
  selectionDraft: (userId: string, challengeId: string, localDate: string) => ["task-selection-draft", userId, challengeId, localDate] as const,
};

export function useTodayTasks(challengeId: string) {
  return useQuery({
    queryKey: todayTaskKeys.detail(challengeId),
    queryFn: () => listTodayTasks(challengeId),
    enabled: Boolean(challengeId),
  });
}

export function useTaskSelectionDraft(userId: string, challengeId: string, tasks: TodayTask[], tasksLoaded: boolean) {
  const queryClient = useQueryClient();
  const localDate = currentLocalDate();
  const storageKey = useMemo(() => taskSelectionDraftKey(userId, challengeId, localDate), [challengeId, localDate, userId]);
  const queryKey = useMemo(() => todayTaskKeys.selectionDraft(userId, challengeId, localDate), [challengeId, localDate, userId]);
  const writeQueue = useRef(Promise.resolve());
  const pendingIds = useMemo(() => tasks.filter((task) => task.status === "pending").map((task) => task.occurrenceId), [tasks]);
  const draft = useQuery({
    queryKey,
    queryFn: () => loadTaskSelectionDraft(storageKey),
    enabled: Boolean(userId && challengeId),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const selectedIds = useMemo(
    () => tasksLoaded ? reconcileTaskSelectionDraft(draft.data ?? [], pendingIds) : (draft.data ?? []),
    [draft.data, pendingIds, tasksLoaded],
  );

  const persist = useCallback((nextIds: string[]) => {
    queryClient.setQueryData<string[]>(queryKey, nextIds);
    writeQueue.current = writeQueue.current.catch(() => undefined).then(() => saveTaskSelectionDraft(storageKey, nextIds));
  }, [queryClient, queryKey, storageKey]);

  useEffect(() => {
    if (!draft.isSuccess || !tasksLoaded) return;
    const storedIds = draft.data ?? [];
    if (storedIds.length === selectedIds.length && storedIds.every((id, index) => id === selectedIds[index])) return;
    persist(selectedIds);
  }, [draft.data, draft.isSuccess, persist, selectedIds, tasksLoaded]);

  const toggle = useCallback((occurrenceId: string) => {
    if (!draft.isSuccess || !tasksLoaded) return;
    persist(selectedIds.includes(occurrenceId)
      ? selectedIds.filter((id) => id !== occurrenceId)
      : [...selectedIds, occurrenceId]);
  }, [draft.isSuccess, persist, selectedIds, tasksLoaded]);

  const clear = useCallback(() => persist([]), [persist]);

  return { selectedIds, toggle, clear, isReady: draft.isSuccess && tasksLoaded };
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
        queryClient.invalidateQueries({ queryKey: challengeActivityKeys.detail(challengeId) }),
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
        queryClient.invalidateQueries({ queryKey: challengeActivityKeys.detail(challengeId) }),
      ]);
    },
  });
}
