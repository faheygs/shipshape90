import { supabase } from "../../lib/supabase";
import type { TodayTask } from "../tasks/taskRepository";

export interface ChallengeHistoryDay {
  localDate: string;
  taskCount: number;
  completedCount: number;
  missedCount: number;
  pendingCount: number;
  dayPoints: number;
}

export interface ChallengeParticipationSummary {
  challengeId: string;
  challengeName: string;
  startsOn: string;
  endsOn: string;
  membershipStatus: string;
  resultStatus: "completed" | "forfeited" | "removed";
  joinedAt: string;
  withdrawnAt: string | null;
  prizeEligible: boolean;
  forfeitureReason: string | null;
  totalPoints: number;
  completedTasks: number;
  scheduledTasks: number;
  completionPercentage: number;
  perfectDays: number;
  daysParticipated: number;
  finalRank: number | null;
  participantCount: number;
}

interface ChallengeDayRow {
  occurrence_id: string;
  task_definition_id: string;
  title: string;
  instructions: string;
  task_type: string;
  target_value: number | null;
  unit: string | null;
  points: number;
  proof_policy: TodayTask["proofPolicy"];
  status: TodayTask["status"];
}

const demoHistory: ChallengeHistoryDay[] = Array.from({ length: 12 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() - index);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const completedCount = index % 5 === 0 ? 3 : 5;
  return { localDate, taskCount: 5, completedCount, missedCount: 5 - completedCount, pendingCount: 0, dayPoints: completedCount === 5 ? 8 : completedCount - (5 - completedCount) * 3 };
});

const demoTasksFor = (localDate: string): TodayTask[] => Array.from({ length: 5 }, (_, index) => ({
  occurrenceId: `demo-${localDate}-${index}`,
  taskDefinitionId: `demo-${index}`,
  title: ["Workout", "Drink water", "Reach your step goal", "Read", "Daily journal"][index],
  meta: "Daily task",
  points: 1,
  proofPolicy: "none",
  status: index < (Number(localDate.slice(-2)) % 5 || 5) ? "complete" : "missed",
}));

const mapTask = (row: ChallengeDayRow): TodayTask => {
  const target = row.target_value == null ? "" : `${row.target_value}${row.unit ? ` ${row.unit}` : ""}`;
  return {
    occurrenceId: row.occurrence_id,
    taskDefinitionId: row.task_definition_id,
    title: row.title,
    meta: [target, row.instructions].filter(Boolean).join(" · "),
    points: row.points,
    proofPolicy: row.proof_policy,
    status: row.status === "pending_review" ? "complete" : row.status,
  };
};

export async function listChallengeHistory(challengeId: string): Promise<ChallengeHistoryDay[]> {
  if (!supabase) return demoHistory;
  const { data, error } = await supabase.rpc("list_challenge_history", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    localDate: row.local_date,
    taskCount: Number(row.task_count),
    completedCount: Number(row.completed_count),
    missedCount: Number(row.missed_count),
    pendingCount: Number(row.pending_count),
    dayPoints: Number(row.day_points),
  }));
}

export async function listMyChallengeHistory(): Promise<ChallengeParticipationSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_my_challenge_history");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    challengeId: row.challenge_id,
    challengeName: row.challenge_name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    membershipStatus: row.membership_status,
    resultStatus: row.result_status as ChallengeParticipationSummary["resultStatus"],
    joinedAt: row.joined_at,
    withdrawnAt: row.withdrawn_at,
    prizeEligible: row.prize_eligible,
    forfeitureReason: row.forfeiture_reason,
    totalPoints: Number(row.total_points),
    completedTasks: Number(row.completed_tasks),
    scheduledTasks: Number(row.scheduled_tasks),
    completionPercentage: Number(row.completion_percentage),
    perfectDays: Number(row.perfect_days),
    daysParticipated: Number(row.days_participated),
    finalRank: row.final_rank === null ? null : Number(row.final_rank),
    participantCount: Number(row.participant_count),
  }));
}

export async function listChallengeDay(challengeId: string, localDate: string): Promise<TodayTask[]> {
  if (!supabase) return demoTasksFor(localDate);
  const { data, error } = await supabase.rpc("list_challenge_day", { target_challenge_id: challengeId, target_local_date: localDate });
  if (error) throw error;
  return ((data ?? []) as ChallengeDayRow[]).map(mapTask);
}

export async function amendChallengeDay(input: { challengeId: string; localDate: string; occurrenceIds: string[] }): Promise<{ completedCount: number; scoreDelta: number; dayPoints: number }> {
  if (!supabase) return { completedCount: input.occurrenceIds.length, scoreDelta: 0, dayPoints: input.occurrenceIds.length };
  const { data, error } = await supabase.rpc("amend_challenge_day", {
    target_challenge_id: input.challengeId,
    target_local_date: input.localDate,
    completed_occurrence_ids: input.occurrenceIds,
  });
  if (error) throw error;
  const result = data?.[0];
  return {
    completedCount: Number(result?.completed_count ?? 0),
    scoreDelta: Number(result?.score_delta ?? 0),
    dayPoints: Number(result?.day_points ?? 0),
  };
}
