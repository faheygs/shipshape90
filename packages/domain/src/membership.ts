export type MembershipStatus =
  | "pending"
  | "active"
  | "withdrawn"
  | "removed"
  | "disqualified"
  | "completed";

export interface ChallengeMembership {
  challengeId: string;
  status: MembershipStatus;
  prizeEligible: boolean;
}

export type JoinDecision =
  | { allowed: true }
  | { allowed: false; reason: "already_joined" | "active_challenge" | "cannot_rejoin" };

const blocksAnotherChallenge = (status: MembershipStatus) =>
  status === "pending" || status === "active";

export function canJoinChallenge(
  memberships: readonly ChallengeMembership[],
  targetChallengeId: string,
): JoinDecision {
  const priorMembership = memberships.find(
    (membership) => membership.challengeId === targetChallengeId,
  );

  if (priorMembership) {
    if (blocksAnotherChallenge(priorMembership.status)) {
      return { allowed: false, reason: "already_joined" };
    }

    return { allowed: false, reason: "cannot_rejoin" };
  }

  if (memberships.some((membership) => blocksAnotherChallenge(membership.status))) {
    return { allowed: false, reason: "active_challenge" };
  }

  return { allowed: true };
}

export function withdrawMembership(
  membership: ChallengeMembership,
): ChallengeMembership {
  if (!blocksAnotherChallenge(membership.status)) {
    throw new Error(`Cannot withdraw a ${membership.status} membership`);
  }

  return {
    ...membership,
    status: "withdrawn",
    prizeEligible: false,
  };
}
