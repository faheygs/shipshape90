import { supabase } from "../../lib/supabase";

export interface TodayTask {
  occurrenceId: string;
  taskDefinitionId: string;
  title: string;
  meta: string;
  points: number;
  proofPolicy: "none" | "optional" | "required";
  status: "pending" | "complete" | "missed" | "excused" | "pending_review";
}

interface TodayTaskRow {
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

const demoTasks: TodayTask[] = [
  { occurrenceId: "demo-workout", taskDefinitionId: "demo-workout", title: "Workout 1", meta: "45 minutes", points: 1, proofPolicy: "none", status: "pending" },
  { occurrenceId: "demo-water", taskDefinitionId: "demo-water", title: "Drink 100 oz water", meta: "Track throughout the day", points: 1, proofPolicy: "none", status: "complete" },
  { occurrenceId: "demo-steps", taskDefinitionId: "demo-steps", title: "Reach 10,000 steps", meta: "Daily target", points: 1, proofPolicy: "none", status: "pending" },
  { occurrenceId: "demo-read", taskDefinitionId: "demo-read", title: "Read 10 pages", meta: "Personal development", points: 1, proofPolicy: "none", status: "complete" },
  { occurrenceId: "demo-journal", taskDefinitionId: "demo-journal", title: "Daily journal", meta: "Write a short reflection", points: 1, proofPolicy: "none", status: "pending" },
];

export function currentLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export async function listTodayTasks(challengeId: string): Promise<TodayTask[]> {
  if (!supabase) return demoTasks;
  const { data, error } = await supabase.rpc("list_today_tasks", {
    target_challenge_id: challengeId,
    requested_local_date: currentLocalDate(),
  });
  if (error) throw error;
  return ((data ?? []) as TodayTaskRow[]).map((row) => {
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
  });
}

export async function completeTodayTask(occurrenceId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("complete_task", {
    target_occurrence_id: occurrenceId,
    command_idempotency_key: `mobile-task:${occurrenceId}`,
    task_completed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function submitChallengeDay(input: { challengeId: string; occurrenceIds: string[] }): Promise<{ completedCount: number; awardedPoints: number }> {
  if (!supabase) return { completedCount: input.occurrenceIds.length, awardedPoints: input.occurrenceIds.length };
  const { data, error } = await supabase.rpc("submit_challenge_day", {
    target_challenge_id: input.challengeId,
    target_local_date: currentLocalDate(),
    selected_occurrence_ids: input.occurrenceIds,
  });
  if (error) throw error;
  const result = data?.[0];
  return { completedCount: result?.completed_count ?? 0, awardedPoints: result?.awarded_points ?? 0 };
}
