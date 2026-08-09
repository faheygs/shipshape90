import type { ActivityEntry } from "@shipshape/api";
import { supabase } from "../../lib/supabase";

interface ActivityRow {
  id: string;
  challenge_id: string | null;
  actor_profile_id: string;
  event_type: ActivityEntry["eventType"];
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { display_name: string; handle: string; avatar_path: string | null } | { display_name: string; handle: string; avatar_path: string | null }[];
}

const activitySelection = "id,challenge_id,actor_profile_id,event_type,body,metadata,created_at,actor:profiles!actor_profile_id(display_name,handle,avatar_path)";

export async function listChallengeActivity(challengeId: string): Promise<ActivityEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("activity_entries")
    .select(activitySelection)
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as ActivityRow[]).map((row) => {
    const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
    return { id: row.id, challengeId: row.challenge_id, actorProfileId: row.actor_profile_id, actorName: actor?.display_name ?? "ShipShape member", actorHandle: actor?.handle ?? "member", actorAvatarPath: actor?.avatar_path ?? null, eventType: row.event_type, body: row.body, metadata: row.metadata, createdAt: row.created_at };
  });
}
