import type { Json } from "@shipshape/api";
import { supabase } from "../../lib/supabase";
import type { ChallengeTaskPreview, CreateChallengeInput } from "./challengeTypes";

export async function createChallenge(input: CreateChallengeInput): Promise<{ challengeId: string; status: "registration" | "active" }> {
  if (!supabase) return { challengeId: `demo-${Date.now()}`, status: "active" };
  const { data, error } = await supabase.rpc("create_challenge", {
    challenge_name: input.name, challenge_description: input.description, challenge_visibility: input.visibility,
    challenge_join_policy: input.joinPolicy, challenge_starts_on: input.startsOn, challenge_ends_on: input.endsOn,
    challenge_reward: input.reward, challenge_weight_bonus_calculation: input.weightBonusCalculation,
    challenge_body_fat_bonus_calculation: input.bodyFatBonusCalculation, configured_checkpoints: input.checkpoints as unknown as Json,
    configured_tasks: input.tasks as unknown as Json, creator_allow_switch: input.allowAutoSwitch ?? false,
    replace_existing_queue: input.replaceExistingQueue ?? false,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The challenge returned an invalid result.");
  const result = data as { challengeId?: unknown; status?: unknown };
  if (typeof result.challengeId !== "string" || (result.status !== "registration" && result.status !== "active")) throw new Error("The challenge returned an invalid result.");
  return { challengeId: result.challengeId, status: result.status };
}

export async function listChallengeTasks(challengeId: string): Promise<ChallengeTaskPreview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_challenge_tasks", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.task_definition_id, title: row.title, instructions: row.instructions, targetValue: row.target_value, unit: row.unit, points: row.points, proofPolicy: row.proof_policy, required: row.required }));
}
