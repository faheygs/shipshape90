import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();
const googleRedirectTo = makeRedirectUri({ scheme: "shipshape90", path: "auth/callback" });

export async function signInWithApple(): Promise<Session> {
  if (!supabase) throw new Error("Hosted authentication is not configured.");
  if (!(await AppleAuthentication.isAvailableAsync())) throw new Error("Sign in with Apple is not available on this device.");
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({ nonce: hashedNonce, requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
  if (!credential.identityToken) throw new Error("Apple did not return an identity token.");
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
  if (!data.session) throw new Error("Apple sign-in could not be completed.");
  const fullName = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName).trim() : "";
  if (fullName) {
    const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: fullName, given_name: credential.fullName?.givenName ?? null, family_name: credential.fullName?.familyName ?? null } });
    if (updateError) throw updateError;
  }
  return data.session;
}

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
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: googleRedirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in could not be opened.");
  const result = await WebBrowser.openAuthSessionAsync(data.url, googleRedirectTo, { preferEphemeralSession: false });
  if (result.type === "cancel" || result.type === "dismiss") return null;
  if (result.type !== "success") throw new Error("Google sign-in could not be completed.");
  return createSessionFromOAuthUrl(result.url);
}
