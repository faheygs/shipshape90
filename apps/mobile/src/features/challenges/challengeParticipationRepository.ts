import { supabase } from "../../lib/supabase";
import type { ChallengeJoinRequestStatus } from "./challengeTypes";

const membershipArgs = (challengeId: string, inviteCode?: string) => inviteCode
  ? { target_challenge_id: challengeId, submitted_invite_code: inviteCode }
  : { target_challenge_id: challengeId };

export async function requestPrivateChallengeJoin(challengeId: string, inviteCode?: string): Promise<Exclude<ChallengeJoinRequestStatus, null>> {
  if (!supabase) return inviteCode ? "approved" : "requested";
  const { data, error } = await supabase.rpc("request_private_challenge_join", { target_challenge_id: challengeId, submitted_invite_code: inviteCode ?? null });
  if (error) throw error;
  return data as Exclude<ChallengeJoinRequestStatus, null>;
}

export async function joinChallenge(challengeId: string, inviteCode?: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("join_challenge", membershipArgs(challengeId, inviteCode));
  if (error) throw error;
}

export async function switchChallenge(challengeId: string, inviteCode?: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("switch_challenge", membershipArgs(challengeId, inviteCode));
  if (error) throw error;
}

export async function setChallengeSaved(challengeId: string, isSaved: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("set_challenge_saved", { target_challenge_id: challengeId, should_save: isSaved });
  if (error) throw error;
}

export async function setChallengeQueued(challengeId: string, isQueued: boolean, allowAutoSwitch = false): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("set_challenge_queued", { target_challenge_id: challengeId, should_queue: isQueued, allow_switch_at_start: allowAutoSwitch });
  if (error) throw error;
}

export async function replaceChallengeQueue(challengeId: string, allowAutoSwitch = false): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("replace_challenge_queue", { target_challenge_id: challengeId, allow_switch_at_start: allowAutoSwitch });
  if (error) throw error;
}

export async function leaveChallenge(challengeId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("leave_challenge", { target_challenge_id: challengeId });
  if (error) throw error;
}
