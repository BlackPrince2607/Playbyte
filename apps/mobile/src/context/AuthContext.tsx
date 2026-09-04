import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api, ensureGuest, getGuestToken, setUnauthorizedHandler, setUserAccessToken } from "../api";
import { getSupabase, isSupabaseConfigured, sessionAccessToken } from "../lib/supabase";

type AuthState = {
  ready: boolean;
  user: User | null;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

async function convertGuestIfNeeded() {
  const guestToken = getGuestToken();
  if (!guestToken) return;
  try {
    await api("/v1/me/convert-guest", {
      method: "POST",
      body: JSON.stringify({ guestToken }),
    });
  } catch {
    /* guest may already be converted */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const authInitId = useRef(0);

  const recoverFrom401 = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured()) {
      setUserAccessToken(null);
      setUser(null);
      try {
        await ensureGuest();
        return true;
      } catch {
        return false;
      }
    }
    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.refreshSession();
      if (error || !data.session) {
        await sb.auth.signOut();
        setUserAccessToken(null);
        setUser(null);
        await ensureGuest();
        return true;
      }
      setUserAccessToken(data.session.access_token);
      setUser(data.session.user);
      return true;
    } catch {
      setUserAccessToken(null);
      setUser(null);
      try {
        await ensureGuest();
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(recoverFrom401);
    return () => setUnauthorizedHandler(null);
  }, [recoverFrom401]);

  useEffect(() => {
    const initId = ++authInitId.current;
    let unsub: (() => void) | undefined;

    (async () => {
      await ensureGuest();
      if (initId !== authInitId.current) return;

      if (!isSupabaseConfigured()) {
        setReady(true);
        return;
      }

      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (initId !== authInitId.current) return;

      const token = sessionAccessToken(data.session);
      setUserAccessToken(token);
      setUser(data.session?.user ?? null);
      if (token) await convertGuestIfNeeded();
      if (initId !== authInitId.current) return;

      const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
        const next = sessionAccessToken(session);
        setUserAccessToken(next);
        setUser(session?.user ?? null);
        if (next) await convertGuestIfNeeded();
        else await ensureGuest();
      });
      unsub = () => sub.subscription.unsubscribe();
      setReady(true);
    })();

    return () => {
      authInitId.current += 1;
      unsub?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUserAccessToken(data.session?.access_token ?? null);
    setUser(data.user);
    await convertGuestIfNeeded();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      setUserAccessToken(data.session.access_token);
      setUser(data.user);
      await convertGuestIfNeeded();
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const sb = getSupabase();
      await sb.auth.signOut();
    }
    setUserAccessToken(null);
    setUser(null);
    await ensureGuest();
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      isSignedIn: Boolean(user),
      signIn,
      signUp,
      signOut,
    }),
    [ready, user, signIn, signUp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
