import { supabase } from "../../lib/supabase";

export interface ChallengeCheckpoint {
  id: string;
  kind: "start" | "milestone" | "final";
  label: string;
  dayNumber: number;
  scheduledOn: string;
  requiresWeight: boolean;
  requiresBodyFat: boolean;
  requiresPhoto: boolean;
  bodyLogId: string | null;
  completedAt: string | null;
  weight: number | null;
  bodyFatPercentage: number | null;
  photoPath: string | null;
  isDue: boolean;
  isBlocking: boolean;
  canComplete: boolean;
}

export async function listMyChallengeCheckpoints(challengeId: string): Promise<ChallengeCheckpoint[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_my_challenge_checkpoints", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.checkpoint_id,
    kind: row.checkpoint_kind as ChallengeCheckpoint["kind"],
    label: row.label,
    dayNumber: row.day_number,
    scheduledOn: row.scheduled_on,
    requiresWeight: row.requires_weight,
    requiresBodyFat: row.requires_body_fat,
    requiresPhoto: row.requires_photo,
    bodyLogId: row.body_log_id,
    completedAt: row.completed_at,
    weight: row.weight === null ? null : Number(row.weight),
    bodyFatPercentage: row.body_fat_percentage === null ? null : Number(row.body_fat_percentage),
    photoPath: row.photo_path,
    isDue: row.is_due,
    isBlocking: row.is_blocking,
    canComplete: row.can_complete,
  }));
}

export async function saveChallengeCheckin(input: {
  checkpointId: string;
  weight?: number;
  bodyFatPercentage?: number;
  photoPath?: string;
  note?: string;
}): Promise<string> {
  if (!supabase) return `demo-${Date.now()}`;
  const { data, error } = await supabase.rpc("save_challenge_checkin", {
    target_checkpoint_id: input.checkpointId,
    log_weight: input.weight,
    log_body_fat_percentage: input.bodyFatPercentage,
    log_photo_path: input.photoPath,
    log_note: input.note,
  });
  if (error) throw error;
  return data;
}
