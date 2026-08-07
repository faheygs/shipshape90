import { useQuery } from "@tanstack/react-query";
import { listChallengeActivity, listCommunityActivity } from "./communityRepository";

export const communityKeys = {
  all: ["community-activity"] as const,
  challenge: (challengeId: string) => ["community-activity", "challenge", challengeId] as const,
};

export function useCommunityActivity() {
  return useQuery({ queryKey: communityKeys.all, queryFn: listCommunityActivity });
}

export function useChallengeActivity(challengeId: string) {
  return useQuery({
    queryKey: communityKeys.challenge(challengeId),
    queryFn: () => listChallengeActivity(challengeId),
    enabled: Boolean(challengeId),
  });
}
