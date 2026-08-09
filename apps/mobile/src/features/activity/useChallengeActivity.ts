import { useQuery } from "@tanstack/react-query";
import { listChallengeActivity } from "./challengeActivityRepository";

export const challengeActivityKeys = {
  detail: (challengeId: string) => ["challenge-activity", challengeId] as const,
};

export function useChallengeActivity(challengeId: string) {
  return useQuery({
    queryKey: challengeActivityKeys.detail(challengeId),
    queryFn: () => listChallengeActivity(challengeId),
    enabled: Boolean(challengeId),
  });
}
