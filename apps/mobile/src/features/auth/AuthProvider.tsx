import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { supabase } from "../../lib/supabase";
import { closeRealtimeConnection } from "../realtime/realtimeClient";
import { deleteAccount as deleteAccountRepository, getCurrentProfile, getSession, isHostedAuthConfigured, signOut as signOutRepository, type Profile } from "./authRepository";

interface AuthContextValue {
  isLoading: boolean;
  isPreview: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(isHostedAuthConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = useCallback(async () => {
    const nextProfile = await getCurrentProfile();
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const bootstrap = async () => {
      try {
        const nextSession = await getSession();
        if (!active) return;
        setSession(nextSession);
        setProfile(nextSession ? await getCurrentProfile() : null);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setIsLoading(Boolean(nextSession));
      setSession(nextSession);
      if (!nextSession) {
        closeRealtimeConnection();
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setTimeout(() => {
        if (!active) return;
        void getCurrentProfile()
          .then((nextProfile) => active && setProfile(nextProfile))
          .finally(() => active && setIsLoading(false));
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    closeRealtimeConnection();
    await signOutRepository();
    setSession(null);
    setProfile(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    closeRealtimeConnection();
    await deleteAccountRepository();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isPreview: !isHostedAuthConfigured,
    session,
    profile,
    refreshProfile,
    signOut,
    deleteAccount,
  }), [deleteAccount, isLoading, profile, refreshProfile, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
