import * as Crypto from "expo-crypto";
import { supabase } from "../../lib/supabase";
import type { Profile } from "./authTypes";

interface ProfileRow { id: string; display_name: string; handle: string | null; avatar_path: string | null; time_zone: string }

const toProfile = (row: ProfileRow): Profile | null => row.handle ? { id: row.id, displayName: row.display_name, handle: row.handle, avatarPath: row.avatar_path, timeZone: row.time_zone } : null;

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;
  const { data, error } = await supabase.from("profiles").select("id,display_name,handle,avatar_path,time_zone").eq("id", sessionData.session.user.id).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

export async function isProfileHandleAvailable(handle: string): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("is_profile_handle_available", { candidate_handle: handle.trim().toLowerCase() });
  if (error) throw error;
  return data;
}

export async function saveProfile(input: { displayName: string; handle: string; avatarPath?: string | null }): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("save_own_profile", { profile_display_name: input.displayName.trim(), profile_handle: input.handle.trim().toLowerCase(), profile_avatar_path: input.avatarPath ?? null, profile_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
  if (error) throw error;
}

export async function uploadProfileAvatar(input: { uri: string; mimeType?: string | null }): Promise<string> {
  if (!supabase) return input.uri;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error("Authentication required.");
  const response = await fetch(input.uri);
  if (!response.ok) throw new Error("The selected photo could not be read.");
  const bytes = await response.arrayBuffer();
  const mimeType = input.mimeType === "image/png" || input.mimeType === "image/webp" ? input.mimeType : "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${sessionData.session.user.id}/avatar-${Crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: mimeType, upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return path;
}

export async function deleteProfileAvatar(path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from("avatars").remove([path]);
  if (error) throw error;
}

export function getAvatarUrl(path: string | null): string | null {
  if (!supabase || !path) return null;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
