import * as Crypto from "expo-crypto";
import { supabase } from "../../lib/supabase";

export interface BodyLog {
  id: string;
  challengeId: string | null;
  loggedOn: string;
  weight: number | null;
  bodyFatPercentage: number | null;
  photoPath: string | null;
  photoUrl: string | null;
  note: string | null;
  createdAt: string;
}

export async function listBodyLogs(challengeId?: string): Promise<BodyLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_body_logs", { target_challenge_id: challengeId });
  if (error) throw error;
  const rows = data ?? [];
  const paths = rows.flatMap((row) => row.photo_path ? [row.photo_path] : []);
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed, error: signedError } = await supabase.storage.from("progress-photos").createSignedUrls(paths, 3600);
    if (signedError) throw signedError;
    signed.forEach((item, index) => { if (item.signedUrl) urlByPath.set(paths[index], item.signedUrl); });
  }
  return rows.map((row) => ({
    id: row.id,
    challengeId: row.challenge_id,
    loggedOn: row.logged_on,
    weight: row.weight === null ? null : Number(row.weight),
    bodyFatPercentage: row.body_fat_percentage === null ? null : Number(row.body_fat_percentage),
    photoPath: row.photo_path,
    photoUrl: row.photo_path ? urlByPath.get(row.photo_path) ?? null : null,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function uploadProgressPhoto(input: { uri: string; mimeType?: string | null; challengeId?: string }): Promise<string> {
  if (!supabase) return input.uri;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Authentication required.");
  const response = await fetch(input.uri);
  if (!response.ok) throw new Error("The selected photo could not be read.");
  const bytes = await response.arrayBuffer();
  const mimeType = input.mimeType === "image/png" || input.mimeType === "image/webp" ? input.mimeType : "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${input.challengeId ?? "overall"}/${Crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("progress-photos").upload(path, bytes, { contentType: mimeType, cacheControl: "3600" });
  if (error) throw error;
  return path;
}

export async function saveBodyLog(input: { challengeId?: string; weight?: number; bodyFatPercentage?: number; photoPath?: string; note?: string }): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("save_body_log", {
    target_challenge_id: input.challengeId,
    log_weight: input.weight,
    log_body_fat_percentage: input.bodyFatPercentage,
    log_photo_path: input.photoPath,
    log_note: input.note,
  });
  if (error) throw error;
}
