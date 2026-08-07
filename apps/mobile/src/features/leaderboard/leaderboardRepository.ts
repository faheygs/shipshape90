import { demoLeaderboard } from "../../data/demo";
import { supabase } from "../../lib/supabase";
import type { ChallengeBonusCalculation, ChallengeBonusMetric, ChallengeScoringMethod } from "../challenges/challengeRepository";

export interface ChallengeLeaderboardEntry {
  rank: number;
  memberId: string;
  profileId: string;
  displayName: string;
  avatarPath: string | null;
  totalPoints: number;
  completionPercentage: number;
  perfectDays: number;
  scoringMethod: ChallengeScoringMethod;
  outcomeValue: number;
  baselineValue: number | null;
  latestValue: number | null;
  bonusMetric: ChallengeBonusMetric;
  bonusCalculation: ChallengeBonusCalculation;
  bonusPoints: number;
  totalScore: number;
  isCurrentUser: boolean;
}

export async function listChallengeLeaderboard(challengeId: string): Promise<ChallengeLeaderboardEntry[]> {
  if (!supabase) {
    return demoLeaderboard.map((entry) => ({
      rank: entry.rank,
      memberId: `demo-member-${entry.rank}`,
      profileId: `demo-profile-${entry.rank}`,
      displayName: entry.name,
      avatarPath: null,
      totalPoints: entry.score,
      completionPercentage: 90,
      perfectDays: Number.parseInt(entry.stat, 10) || 0,
      scoringMethod: "total_points",
      outcomeValue: entry.score,
      baselineValue: null,
      latestValue: null,
      bonusMetric: "none",
      bonusCalculation: null,
      bonusPoints: 0,
      totalScore: entry.score,
      isCurrentUser: Boolean(entry.isYou),
    }));
  }

  const { data, error } = await supabase.rpc("list_challenge_leaderboard", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    rank: Number(row.rank),
    memberId: row.member_id,
    profileId: row.profile_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    totalPoints: row.total_points,
    completionPercentage: Number(row.completion_percentage),
    perfectDays: row.perfect_days,
    scoringMethod: row.scoring_method as ChallengeScoringMethod,
    outcomeValue: Number(row.outcome_value),
    baselineValue: row.baseline_value === null ? null : Number(row.baseline_value),
    latestValue: row.latest_value === null ? null : Number(row.latest_value),
    bonusMetric: row.bonus_metric as ChallengeBonusMetric,
    bonusCalculation: row.bonus_calculation as ChallengeBonusCalculation,
    bonusPoints: Number(row.bonus_points),
    totalScore: Number(row.total_score),
    isCurrentUser: row.is_current_user,
  }));
}

export async function getMyPerfectDayStreak(challengeId: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("get_my_perfect_day_streak", { target_challenge_id: challengeId });
  if (error) throw error;
  return data;
}
