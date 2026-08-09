import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { OtpDestination } from "./authTypes";

export * from "./authTypes";
export * from "./oauthRepository";
export * from "./profileRepository";

export const isHostedAuthConfigured = supabase !== null;
const normalizeEmail = (value: string) => value.trim().toLowerCase();

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requestOtp(destination: OtpDestination): Promise<void> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  const { error } = await supabase.auth.signInWithOtp({ email: normalizeEmail(destination.value), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyOtp(destination: OtpDestination, token: string): Promise<Session> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  const { data, error } = await supabase.auth.verifyOtp({ email: normalizeEmail(destination.value), token: token.trim(), type: "email" });
  if (error) throw error;
  if (!data.session) throw new Error("The code could not be verified.");
  return data.session;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  if (!supabase) throw new Error("Account deletion is unavailable in preview mode.");
  const { error } = await supabase.functions.invoke("delete-account");
  if (error) throw error;
  await supabase.auth.signOut({ scope: "local" });
}
