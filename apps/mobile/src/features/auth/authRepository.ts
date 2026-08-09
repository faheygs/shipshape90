import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export type OtpDestination = { kind: "email"; value: string };

export interface Profile {
  id: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  timeZone: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_path: string | null;
  time_zone: string;
}

export const isHostedAuthConfigured = supabase !== null;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const toProfile = (row: ProfileRow): Profile | null => {
  if (!row.handle) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    handle: row.handle,
    avatarPath: row.avatar_path,
    timeZone: row.time_zone,
  };
};

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,handle,avatar_path,time_zone")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

export async function signInWithApple(): Promise<Session> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  if (!(await AppleAuthentication.isAvailableAsync())) throw new Error("Sign in with Apple is not available on this device.");

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    nonce: hashedNonce,
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
  });
  if (!credential.identityToken) throw new Error("Apple did not return an identity token.");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  if (!data.session) throw new Error("Apple sign-in could not be completed.");

  const fullName = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName).trim() : "";
  if (fullName) {
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        given_name: credential.fullName?.givenName ?? null,
        family_name: credential.fullName?.familyName ?? null,
      },
    });
    if (updateError) throw updateError;
  }
  return data.session;
}

const googleRedirectTo = makeRedirectUri({ scheme: "shipshape90", path: "auth/callback" });

async function createSessionFromOAuthUrl(url: string): Promise<Session> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(typeof params.error_description === "string" ? params.error_description : errorCode);

  const accessToken = typeof params.access_token === "string" ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === "string" ? params.refresh_token : null;
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    if (!data.session) throw new Error("Google sign-in could not be completed.");
    return data.session;
  }

  const code = typeof params.code === "string" ? params.code : null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session) throw new Error("Google sign-in could not be completed.");
    return data.session;
  }

  throw new Error("Google did not return a valid sign-in session.");
}

export async function signInWithGoogle(): Promise<Session | null> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleRedirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in could not be opened.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, googleRedirectTo, {
    preferEphemeralSession: false,
  });
  if (result.type === "cancel" || result.type === "dismiss") return null;
  if (result.type !== "success") throw new Error("Google sign-in could not be completed.");
  return createSessionFromOAuthUrl(result.url);
}

export async function requestOtp(destination: OtpDestination): Promise<void> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(destination.value),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyOtp(destination: OtpDestination, token: string): Promise<Session> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(destination.value),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
  if (!data.session) throw new Error("The code could not be verified.");
  return data.session;
}

export async function isProfileHandleAvailable(handle: string): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("is_profile_handle_available", {
    candidate_handle: handle.trim().toLowerCase(),
  });
  if (error) throw error;
  return data;
}

export async function saveProfile(input: { displayName: string; handle: string; avatarPath?: string | null }): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("save_own_profile", {
    profile_display_name: input.displayName.trim(),
    profile_handle: input.handle.trim().toLowerCase(),
    profile_avatar_path: input.avatarPath ?? null,
    profile_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
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
  const { error } = await supabase.storage.from("avatars").upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
    cacheControl: "3600",
  });
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
