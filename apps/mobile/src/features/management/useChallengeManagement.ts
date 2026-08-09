import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { challengeKeys } from "../challenges/useChallenges";
import { challengeHistoryKeys } from "../history/useChallengeHistory";
import {
  closeManagedChallenge,
  createManagedInvite,
  getChallengeManagement,
  listManagedChallengeInvites,
  listManagedChallengeMembers,
  listManagedChallengeQueue,
  removeManagedMember,
  reviewJoinRequest,
  revokeManagedInvite,
} from "./challengeManagementRepository";

export const managementKeys = {
  all: (challengeId: string) => ["challenge-management", challengeId] as const,
  summary: (challengeId: string) => ["challenge-management", challengeId, "summary"] as const,
  members: (challengeId: string) => ["challenge-management", challengeId, "members"] as const,
  queue: (challengeId: string) => ["challenge-management", challengeId, "queue"] as const,
  invites: (challengeId: string) => ["challenge-management", challengeId, "invites"] as const,
};

export const useChallengeManagement = (challengeId: string) => useQuery({ queryKey: managementKeys.summary(challengeId), queryFn: () => getChallengeManagement(challengeId), enabled: Boolean(challengeId) });
export const useManagedChallengeMembers = (challengeId: string) => useQuery({ queryKey: managementKeys.members(challengeId), queryFn: () => listManagedChallengeMembers(challengeId), enabled: Boolean(challengeId) });
export const useManagedChallengeQueue = (challengeId: string) => useQuery({ queryKey: managementKeys.queue(challengeId), queryFn: () => listManagedChallengeQueue(challengeId), enabled: Boolean(challengeId) });
export const useManagedChallengeInvites = (challengeId: string) => useQuery({ queryKey: managementKeys.invites(challengeId), queryFn: () => listManagedChallengeInvites(challengeId), enabled: Boolean(challengeId) });

const useRefreshManagement = (challengeId: string) => {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: managementKeys.all(challengeId) }),
    queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
  ]);
};

export function useReviewJoinRequest(challengeId: string) {
  const refresh = useRefreshManagement(challengeId);
  return useMutation({ mutationFn: ({ memberId, approve }: { memberId: string; approve: boolean }) => reviewJoinRequest(challengeId, memberId, approve), onSuccess: refresh });
}

export function useRemoveManagedMember(challengeId: string) {
  const refresh = useRefreshManagement(challengeId);
  return useMutation({ mutationFn: (memberId: string) => removeManagedMember(challengeId, memberId), onSuccess: refresh });
}

export function useCreateManagedInvite(challengeId: string) {
  const refresh = useRefreshManagement(challengeId);
  return useMutation({ mutationFn: () => createManagedInvite(challengeId), onSuccess: refresh });
}

export function useRevokeManagedInvite(challengeId: string) {
  const refresh = useRefreshManagement(challengeId);
  return useMutation({ mutationFn: revokeManagedInvite, onSuccess: refresh });
}

export function useCloseManagedChallenge(challengeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "cancel" | "end") => closeManagedChallenge(challengeId, action),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: managementKeys.all(challengeId) }),
      queryClient.invalidateQueries({ queryKey: challengeKeys.all }),
      queryClient.invalidateQueries({ queryKey: challengeHistoryKeys.summary }),
    ]),
  });
}
