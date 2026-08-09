export type ChallengeMembershipStatus = "none" | "pending" | "active" | "withdrawn" | "removed" | "completed";
export type ChallengeScoringMethod = "total_points";
export type ChallengeBonusMetric = "none" | "weight" | "body_fat";
export type ChallengeBonusCalculation = "percentage" | "total_change" | null;
export type ChallengeJoinRequestStatus = "requested" | "approved" | "declined" | "joined" | "cancelled" | null;

export interface ChallengeCheckpointInput {
  kind: "start" | "milestone" | "final";
  label: string;
  dayNumber: number;
  requiresWeight: boolean;
  requiresBodyFat: boolean;
  requiresPhoto: boolean;
}

export interface ChallengeListItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "approval" | "invite_only";
  challengeStatus: "draft" | "registration" | "active" | "review" | "complete" | "archived";
  startsOn: string;
  endsOn: string;
  participantCount: number;
  membershipStatus: ChallengeMembershipStatus;
  coverPath: string | null;
  prizeDescription: string | null;
  scoringMethod: ChallengeScoringMethod;
  bonusMetric: ChallengeBonusMetric;
  bonusCalculation: ChallengeBonusCalculation;
  weightBonusCalculation: ChallengeBonusCalculation;
  bodyFatBonusCalculation: ChallengeBonusCalculation;
  isSaved: boolean;
  isQueued: boolean;
  queueStatus: "queued" | "blocked" | "joined" | "failed" | null;
  isOwner: boolean;
  joinRequestStatus: ChallengeJoinRequestStatus;
}

export interface ChallengeTaskPreview {
  id: string;
  title: string;
  instructions: string;
  targetValue: number | null;
  unit: string | null;
  points: number;
  proofPolicy: "none" | "optional" | "required";
  required: boolean;
}

export interface ConfiguredChallengeTask {
  catalogTaskId: string;
  instructions: string;
  targetValue: number | null;
  unit: string | null;
}

export interface CreateChallengeInput {
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "approval" | "invite_only";
  startsOn: string;
  endsOn: string;
  reward: "Bragging rights" | "Prize";
  weightBonusCalculation: ChallengeBonusCalculation;
  bodyFatBonusCalculation: ChallengeBonusCalculation;
  checkpoints: ChallengeCheckpointInput[];
  tasks: ConfiguredChallengeTask[];
  allowAutoSwitch?: boolean;
  replaceExistingQueue?: boolean;
}
