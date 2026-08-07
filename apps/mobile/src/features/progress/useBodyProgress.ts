import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listBodyLogs, saveBodyLog, type BodyLog } from "./bodyProgressRepository";

export const bodyProgressKeys = {
  all: ["body-progress"] as const,
  list: (challengeId?: string) => ["body-progress", challengeId ?? "overall"] as const,
};

export function useBodyProgress(challengeId?: string) {
  return useQuery({ queryKey: bodyProgressKeys.list(challengeId), queryFn: () => listBodyLogs(challengeId) });
}

export function useSaveBodyLog(challengeId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof saveBodyLog>[0], "challengeId">) => saveBodyLog({ ...input, challengeId }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: bodyProgressKeys.all }),
      queryClient.invalidateQueries({ queryKey: bodyProgressKeys.list(challengeId) }),
    ]),
  });
}

export function metricSeries(logs: BodyLog[], metric: "weight" | "bodyFatPercentage"): { date: string; value: number }[] {
  return logs.flatMap((log) => log[metric] === null ? [] : [{ date: log.loggedOn, value: log[metric] as number }]);
}
