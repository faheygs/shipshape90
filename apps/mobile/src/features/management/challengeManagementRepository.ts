import { supabase } from "../../lib/supabase";

export interface ChallengeManagementSummary {
  challengeId: string;
  name: string;
  description: string;
  status: "draft" | "registration" | "active" | "review" | "complete" | "archived";
  visibility: "public" | "unlisted" | "private";
  joinPolicy: "open" | "approval" | "invite_only";
  startsOn: string;
  endsOn: string;
  rulesLocked: boolean;
  activeMembers: number;
  pendingRequests: number;
  queuedMembers: number;
  totalPoints: number;
  averageCompletion: number;
}

export interface ManagedChallengeMember {
  memberId: string;
  profileId: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  role: "owner" | "moderator" | "participant";
  status: "pending" | "active" | "left" | "removed" | "completed";
  joinedAt: string | null;
  prizeEligible: boolean;
  totalPoints: number;
  completionPercentage: number;
  perfectDays: number;
}

export interface ManagedQueueEntry {
  profileId: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  status: string;
  queuedAt: string;
  scoringTimeZone: string;
  allowAutoSwitch: boolean;
}

export interface ManagedInvite {
  inviteId: string;
  code: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const database = () => {
  if (!supabase) throw new Error("Challenge management requires a connected account.");
  return supabase;
};

export async function getChallengeManagement(challengeId: string): Promise<ChallengeManagementSummary> {
  const { data, error } = await database().rpc("get_challenge_management", { target_challenge_id: challengeId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Challenge management details were not found.");
  return {
    challengeId: row.challenge_id,
    name: row.name,
    description: row.description,
    status: row.challenge_status as ChallengeManagementSummary["status"],
    visibility: row.visibility,
    joinPolicy: row.join_policy as ChallengeManagementSummary["joinPolicy"],
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    rulesLocked: row.rules_locked,
    activeMembers: Number(row.active_members),
    pendingRequests: Number(row.pending_requests),
    queuedMembers: Number(row.queued_members),
    totalPoints: Number(row.total_points),
    averageCompletion: Number(row.average_completion),
  };
}

export async function listManagedChallengeMembers(challengeId: string): Promise<ManagedChallengeMember[]> {
  const { data, error } = await database().rpc("list_challenge_management_members", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    memberId: row.member_id,
    profileId: row.profile_id,
    displayName: row.display_name,
    handle: row.handle,
    avatarPath: row.avatar_path,
    role: row.role,
    status: row.member_status,
    joinedAt: row.joined_at,
    prizeEligible: row.prize_eligible,
    totalPoints: Number(row.total_points),
    completionPercentage: Number(row.completion_percentage),
    perfectDays: Number(row.perfect_days),
  }));
}

export async function listManagedChallengeQueue(challengeId: string): Promise<ManagedQueueEntry[]> {
  const { data, error } = await database().rpc("list_challenge_management_queue", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    profileId: row.profile_id,
    displayName: row.display_name,
    handle: row.handle,
    avatarPath: row.avatar_path,
    status: row.queue_status,
    queuedAt: row.queued_at,
    scoringTimeZone: row.scoring_time_zone,
    allowAutoSwitch: row.allow_auto_switch,
  }));
}

export async function listManagedChallengeInvites(challengeId: string): Promise<ManagedInvite[]> {
  const { data, error } = await database().rpc("list_challenge_management_invites", { target_challenge_id: challengeId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    inviteId: row.invite_id,
    code: row.code,
    maxUses: row.max_uses,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
}

export async function createManagedInvite(challengeId: string): Promise<string> {
  const { data, error } = await database().rpc("create_challenge_invite", { target_challenge_id: challengeId });
  if (error) throw error;
  return data;
}

export async function reviewJoinRequest(challengeId: string, memberId: string, approve: boolean): Promise<void> {
  const { error } = await database().rpc("review_challenge_join_request", { target_challenge_id: challengeId, target_member_id: memberId, approve_request: approve });
  if (error) throw error;
}

export async function removeManagedMember(challengeId: string, memberId: string): Promise<void> {
  const { error } = await database().rpc("remove_challenge_member", { target_challenge_id: challengeId, target_member_id: memberId });
  if (error) throw error;
}

export async function revokeManagedInvite(inviteId: string): Promise<void> {
  const { error } = await database().rpc("revoke_challenge_invite", { target_invite_id: inviteId });
  if (error) throw error;
}

export async function closeManagedChallenge(challengeId: string, action: "cancel" | "end"): Promise<void> {
  const { error } = await database().rpc("close_owned_challenge", { target_challenge_id: challengeId, close_action: action });
  if (error) throw error;
}
