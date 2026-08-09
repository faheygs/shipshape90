import { demoChallenges } from "../../data/demo";
import { supabase } from "../../lib/supabase";
import type { ChallengeBonusCalculation, ChallengeBonusMetric, ChallengeListItem, ChallengeMembershipStatus, ChallengeScoringMethod } from "./challengeTypes";

interface ChallengeRow {
  id: string; slug: string; name: string; description: string;
  visibility: ChallengeListItem["visibility"]; join_policy: ChallengeListItem["joinPolicy"]; challenge_status: ChallengeListItem["challengeStatus"];
  starts_on: string; ends_on: string; participant_count: number; membership_status: ChallengeMembershipStatus | "left";
  cover_path: string | null; prize_description: string | null; scoring_method: ChallengeScoringMethod; bonus_metric: ChallengeBonusMetric;
  bonus_calculation: ChallengeBonusCalculation; weight_bonus_calculation: ChallengeBonusCalculation; body_fat_bonus_calculation: ChallengeBonusCalculation;
  is_saved: boolean; is_queued: boolean; queue_status: ChallengeListItem["queueStatus"]; is_owner: boolean; join_request_status: ChallengeListItem["joinRequestStatus"];
}

const demoItem = (index: number, overrides: Partial<ChallengeListItem> = {}): ChallengeListItem => {
  const challenge = demoChallenges[index];
  return {
    id: challenge.id, slug: challenge.id, name: challenge.title,
    description: "A focused challenge built around consistent daily commitments.", visibility: challenge.isPrivate ? "private" : "public",
    joinPolicy: challenge.isPrivate ? "invite_only" : "open", challengeStatus: challenge.status === "active" ? "active" : "registration",
    startsOn: "2026-08-01", endsOn: "2026-10-29", participantCount: Number.parseInt(challenge.members, 10) || 0,
    membershipStatus: challenge.status === "active" ? "active" : "none", coverPath: null, prizeDescription: challenge.status === "active" ? "Prize" : null,
    scoringMethod: "total_points", bonusMetric: "none", bonusCalculation: null, weightBonusCalculation: null, bodyFatBonusCalculation: null,
    isSaved: false, isQueued: false, queueStatus: null, isOwner: false, joinRequestStatus: null, ...overrides,
  };
};

const mapRow = (row: ChallengeRow): ChallengeListItem => ({
  id: row.id, slug: row.slug, name: row.name, description: row.description, visibility: row.visibility, joinPolicy: row.join_policy,
  challengeStatus: row.challenge_status, startsOn: row.starts_on, endsOn: row.ends_on, participantCount: Number(row.participant_count),
  membershipStatus: row.membership_status === "left" ? "withdrawn" : row.membership_status, coverPath: row.cover_path,
  prizeDescription: row.prize_description, scoringMethod: row.scoring_method, bonusMetric: row.bonus_metric, bonusCalculation: row.bonus_calculation,
  weightBonusCalculation: row.weight_bonus_calculation, bodyFatBonusCalculation: row.body_fat_bonus_calculation, isSaved: row.is_saved,
  isQueued: row.is_queued, queueStatus: row.queue_status, isOwner: row.is_owner, joinRequestStatus: row.join_request_status,
});

export async function listChallenges(): Promise<ChallengeListItem[]> {
  if (!supabase) return demoChallenges.map((_challenge, index) => demoItem(index));
  const { data, error } = await supabase.rpc("list_challenges");
  if (error) throw error;
  return ((data ?? []) as ChallengeRow[]).map(mapRow);
}

export async function resolveInvite(inviteCode: string): Promise<ChallengeListItem | null> {
  if (!supabase) return inviteCode.trim().toUpperCase() === "SHIP90" ? demoItem(1, { description: "A private 90-day reset focused on sustainable daily commitments.", startsOn: "2026-09-01", endsOn: "2026-11-29", membershipStatus: "none", prizeDescription: null }) : null;
  const { data, error } = await supabase.rpc("resolve_challenge_invite", { submitted_invite_code: inviteCode });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.challenge_id, slug: row.challenge_id, name: row.name, description: row.description, visibility: "private", joinPolicy: "invite_only",
    challengeStatus: row.challenge_status as ChallengeListItem["challengeStatus"], startsOn: row.starts_on, endsOn: row.ends_on,
    participantCount: Number(row.participant_count), membershipStatus: "none", coverPath: row.cover_path, prizeDescription: row.prize_description,
    scoringMethod: row.scoring_method as ChallengeScoringMethod, bonusMetric: row.bonus_metric as ChallengeBonusMetric,
    bonusCalculation: row.bonus_calculation as ChallengeBonusCalculation,
    weightBonusCalculation: (row.bonus_metric === "weight" ? row.bonus_calculation : null) as ChallengeBonusCalculation,
    bodyFatBonusCalculation: (row.bonus_metric === "body_fat" ? row.bonus_calculation : null) as ChallengeBonusCalculation,
    isSaved: false, isQueued: false, queueStatus: null, isOwner: false, joinRequestStatus: null,
  };
}
