import { supabase } from "../../lib/supabase";
import { demoChallenges } from "../../data/demo";
import type { Json } from "@shipshape/api";

export type ChallengeMembershipStatus = "none" | "pending" | "active" | "withdrawn" | "removed" | "completed";
export type ChallengeScoringMethod = "total_points";
export type ChallengeBonusMetric = "none" | "weight" | "body_fat";
export type ChallengeBonusCalculation = "percentage" | "total_change" | null;

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
  isSaved: boolean;
  isQueued: boolean;
  queueStatus: "queued" | "blocked" | "joined" | "failed" | null;
  isOwner: boolean;
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

interface ChallengeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: ChallengeListItem["visibility"];
  join_policy: ChallengeListItem["joinPolicy"];
  challenge_status: ChallengeListItem["challengeStatus"];
  starts_on: string;
  ends_on: string;
  participant_count: number;
  membership_status: ChallengeMembershipStatus | "left";
  cover_path: string | null;
  prize_description: string | null;
  scoring_method: ChallengeScoringMethod;
  bonus_metric: ChallengeBonusMetric;
  bonus_calculation: ChallengeBonusCalculation;
  is_saved: boolean;
  is_queued: boolean;
  queue_status: ChallengeListItem["queueStatus"];
  is_owner: boolean;
}

const normalizeStatus = (status: ChallengeRow["membership_status"]): ChallengeMembershipStatus => status === "left" ? "withdrawn" : status;

export async function listChallenges(): Promise<ChallengeListItem[]> {
  if (!supabase) {
    return demoChallenges.map((challenge) => ({
      id: challenge.id,
      slug: challenge.id,
      name: challenge.title,
      description: "A focused challenge built around consistent daily commitments.",
      visibility: challenge.isPrivate ? "private" : "public",
      joinPolicy: challenge.isPrivate ? "invite_only" : "open",
      challengeStatus: challenge.status === "active" ? "active" : "registration",
      startsOn: "2026-08-01",
      endsOn: "2026-10-29",
      participantCount: Number.parseInt(challenge.members, 10) || 0,
      membershipStatus: challenge.status === "active" ? "active" : "none",
      coverPath: null,
      prizeDescription: challenge.status === "active" ? "Prize" : null,
      scoringMethod: "total_points",
      bonusMetric: "none",
      bonusCalculation: null,
      isSaved: false,
      isQueued: false,
      queueStatus: null,
      isOwner: false,
    }));
  }

  const { data, error } = await supabase.rpc("list_challenges");
  if (error) throw error;
  return ((data ?? []) as ChallengeRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    joinPolicy: row.join_policy,
    challengeStatus: row.challenge_status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    participantCount: Number(row.participant_count),
    membershipStatus: normalizeStatus(row.membership_status),
    coverPath: row.cover_path,
    prizeDescription: row.prize_description,
    scoringMethod: row.scoring_method,
    bonusMetric: row.bonus_metric,
    bonusCalculation: row.bonus_calculation,
    isSaved: row.is_saved,
    isQueued: row.is_queued,
    queueStatus: row.queue_status,
    isOwner: row.is_owner,
  }));
}

export async function joinChallenge(challengeId: string, inviteCode?: string): Promise<void> {
  if (!supabase) return;
  const args = inviteCode
    ? { target_challenge_id: challengeId, submitted_invite_code: inviteCode }
    : { target_challenge_id: challengeId };
  const { error } = await supabase.rpc("join_challenge", args);
  if (error) throw error;
}

export async function switchChallenge(challengeId: string, inviteCode?: string): Promise<void> {
  if (!supabase) return;
  const args = inviteCode
    ? { target_challenge_id: challengeId, submitted_invite_code: inviteCode }
    : { target_challenge_id: challengeId };
  const { error } = await supabase.rpc("switch_challenge", args);
  if (error) throw error;
}

export async function setChallengeSaved(challengeId: string, isSaved: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("set_challenge_saved", {
    target_challenge_id: challengeId,
    should_save: isSaved,
  });
  if (error) throw error;
}

export async function setChallengeQueued(challengeId: string, isQueued: boolean, allowAutoSwitch = false): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("set_challenge_queued", {
    target_challenge_id: challengeId,
    should_queue: isQueued,
    allow_switch_at_start: allowAutoSwitch,
  });
  if (error) throw error;
}

export async function leaveChallenge(challengeId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("leave_challenge", { target_challenge_id: challengeId });
  if (error) throw error;
}

export async function resolveInvite(inviteCode: string): Promise<ChallengeListItem | null> {
  if (!supabase) {
    if (inviteCode.trim().toUpperCase() !== "SHIP90") return null;
    const challenge = demoChallenges[1];
    return {
      id: challenge.id,
      slug: challenge.id,
      name: challenge.title,
      description: "A private 90-day reset focused on sustainable daily commitments.",
      visibility: "private",
      joinPolicy: "invite_only",
      challengeStatus: "registration",
      startsOn: "2026-09-01",
      endsOn: "2026-11-29",
      participantCount: Number.parseInt(challenge.members, 10) || 0,
      membershipStatus: "none",
      coverPath: null,
      prizeDescription: null,
      scoringMethod: "total_points",
      bonusMetric: "none",
      bonusCalculation: null,
      isSaved: false,
      isQueued: false,
      queueStatus: null,
      isOwner: false,
    };
  }
  const { data, error } = await supabase.rpc("resolve_challenge_invite", { submitted_invite_code: inviteCode });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.challenge_id,
    slug: row.challenge_id,
    name: row.name,
    description: row.description,
    visibility: "private",
    joinPolicy: "invite_only",
    challengeStatus: "registration",
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    participantCount: Number(row.participant_count),
    membershipStatus: "none",
    coverPath: row.cover_path,
    prizeDescription: row.prize_description,
    scoringMethod: row.scoring_method as ChallengeScoringMethod,
    bonusMetric: row.bonus_metric as ChallengeBonusMetric,
    bonusCalculation: row.bonus_calculation as ChallengeBonusCalculation,
    isSaved: false,
    isQueued: false,
    queueStatus: null,
    isOwner: false,
  };
}

export interface ConfiguredChallengeTask {
  catalogTaskId: string;
  instructions: string;
  targetValue: number | null;
  unit: string | null;
}

export async function createChallengeDraft(input: { name: string; description: string; visibility: "public" | "unlisted" | "private"; joinPolicy: "open" | "approval" | "invite_only"; startsOn: string; endsOn: string; reward: "Bragging rights" | "Prize"; bonusMetric: ChallengeBonusMetric; bonusCalculation: ChallengeBonusCalculation; tasks: ConfiguredChallengeTask[] }): Promise<string> {
  if (!supabase) return `demo-${Date.now()}`;
  const { data, error } = await supabase.rpc("create_challenge_draft", {
    challenge_name: input.name,
    challenge_description: input.description,
    challenge_visibility: input.visibility,
    challenge_join_policy: input.joinPolicy,
    challenge_starts_on: input.startsOn,
    challenge_ends_on: input.endsOn,
    challenge_reward: input.reward,
    challenge_bonus_metric: input.bonusMetric,
    challenge_bonus_calculation: input.bonusCalculation,
    configured_tasks: input.tasks as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function publishChallenge(challengeId: string): Promise<"registration" | "active"> {
  if (!supabase) return "active";
  const { data, error } = await supabase.rpc("publish_challenge", { target_challenge_id: challengeId });
  if (error) throw error;
  if (data !== "registration" && data !== "active") throw new Error("The challenge returned an invalid status.");
  return data;
}

export async function listChallengeTasks(challengeId: string): Promise<ChallengeTaskPreview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_challenge_tasks", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.task_definition_id,
    title: row.title,
    instructions: row.instructions,
    targetValue: row.target_value,
    unit: row.unit,
    points: row.points,
    proofPolicy: row.proof_policy,
    required: row.required,
  }));
}
