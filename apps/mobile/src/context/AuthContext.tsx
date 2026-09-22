import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthError, User } from "@supabase/supabase-js";
import {
  api,
  ensureGuest,
  getGuestToken,
  isApiError,
  loadToken,
  setUnauthorizedHandler,
  setUserAccessToken,
} from "../api";
import {
  getGoogleIdToken,
  isGoogleNativeError,
  isGoogleSignInConfigured,
  mapGoogleSignInError,
} from "../lib/googleAuth";
import {
  clearLocalSupabaseSession,
  getSupabase,
  isSupabaseConfigured,
  sessionAccessToken,
} from "../lib/supabase";

type AuthState = {
  ready: boolean;
  user: User | null;
  isSignedIn: boolean;
  googleAvailable: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<"session" | "confirm_email">;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const AUTH_INIT_BUDGET_MS = 6_000;
const GET_SESSION_MS = 4_000;
const ID_TOKEN_SIGNIN_MS = 15_000;

export function mapAuthError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as AuthError).message || "");
    const lower = msg.toLowerCase();
    if (lower.includes("invalid login credentials")) return "Incorrect email or password.";
    if (lower.includes("user already registered")) return "An account with this email already exists. Sign in instead.";
    if (lower.includes("provider") && lower.includes("not enabled")) {
      return "Google Sign-In is not enabled on the server yet. Use email, or ask the team to enable Google in Supabase.";
    }
    if (lower.includes("unacceptable audience") || (lower.includes("audience") && lower.includes("token"))) {
      return "Google client ID mismatch. The Web client ID in the app must match Supabase Google provider settings.";
    }
    if (lower.includes("id token") || lower.includes("id_token") || lower.includes("jwt")) {
      return "Google sign-in could not be verified. Check the Web client ID and secret in Supabase.";
    }
    if (lower.includes("timed out") || lower.includes("timeout")) {
      return "Sign-in timed out. Check your connection and try again.";
    }
    if (lower.includes("password")) return msg;
    if (lower.includes("email")) return msg;
    if (msg) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not authenticate.";
}

function validateCredentials(email: string, password: string) {
  const trimmed = email.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid email address.");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

async function convertGuestIfNeeded() {
  const guestToken = getGuestToken();
  if (!guestToken) return;
  try {
    await api("/v1/me/convert-guest", {
      method: "POST",
      body: JSON.stringify({ guestToken }),
    });
  } catch (e) {
    if (isApiError(e) && (e.status === 404 || e.status === 409)) return;
    console.warn("[auth] convert-guest failed", e);
  }
}

/** Defer work so onAuthStateChange can release its auth lock (avoids supabase-js deadlock). */
function deferAuthSideEffect(work: () => Promise<void>) {
  setTimeout(() => {
    void work().catch((e) => console.warn("[auth] deferred side effect failed", e));
  }, 0);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const authInitId = useRef(0);
  const readyOnce = useRef(false);

  const markReady = useCallback(() => {
    if (readyOnce.current) return;
    readyOnce.current = true;
    setReady(true);
  }, []);

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
      const { data, error } = await withTimeout(sb.auth.refreshSession(), 8_000, "refreshSession");
      if (error || !data.session) {
        await clearLocalSupabaseSession();
        setUserAccessToken(null);
        setUser(null);
        await ensureGuest();
        return true;
      }
      setUserAccessToken(data.session.access_token);
      setUser(data.session.user);
      return true;
    } catch {
      await clearLocalSupabaseSession();
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
    const budgetTimer = setTimeout(() => {
      if (initId === authInitId.current) {
        console.warn("[auth] init budget exceeded — continuing without session");
        markReady();
      }
    }, AUTH_INIT_BUDGET_MS);

    (async () => {
      try {
        // Storage only — do not block splash on network guest creation.
        await loadToken();
        if (initId !== authInitId.current) return;

        if (isSupabaseConfigured()) {
          const sb = getSupabase();

          // Sync callback only. Awaiting supabase/API here deadlocks the client.
          const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
            const next = sessionAccessToken(session);
            setUserAccessToken(next);
            setUser(session?.user ?? null);
            if (next && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
              deferAuthSideEffect(convertGuestIfNeeded);
            } else if (!next && event === "SIGNED_OUT") {
              deferAuthSideEffect(async () => {
                await ensureGuest();
              });
            }
          });
          unsub = () => sub.subscription.unsubscribe();

          try {
            const { data } = await withTimeout(sb.auth.getSession(), GET_SESSION_MS, "getSession");
            if (initId !== authInitId.current) return;
            const token = sessionAccessToken(data.session);
            setUserAccessToken(token);
            setUser(data.session?.user ?? null);
          } catch (e) {
            console.warn("[auth] getSession failed — clearing local session", e);
            await clearLocalSupabaseSession();
            if (initId !== authInitId.current) return;
            setUserAccessToken(null);
            setUser(null);
          }
        }
      } catch (e) {
        console.warn("[auth] init failed", e);
        setUserAccessToken(null);
        setUser(null);
      } finally {
        clearTimeout(budgetTimer);
        if (initId === authInitId.current) markReady();
        // Network guest bootstrap after UI can render.
        deferAuthSideEffect(async () => {
          try {
            await ensureGuest();
          } catch (e) {
            console.warn("[auth] ensureGuest after ready failed", e);
          }
        });
      }
    })();

    return () => {
      authInitId.current += 1;
      clearTimeout(budgetTimer);
      unsub?.();
    };
  }, [markReady]);

  const signIn = useCallback(async (email: string, password: string) => {
    validateCredentials(email, password);
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(mapAuthError(error));
    setUserAccessToken(data.session?.access_token ?? null);
    setUser(data.user);
    deferAuthSideEffect(convertGuestIfNeeded);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    validateCredentials(email, password);
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(mapAuthError(error));
    if (data.session) {
      setUserAccessToken(data.session.access_token);
      setUser(data.user);
      deferAuthSideEffect(convertGuestIfNeeded);
      return "session" as const;
    }
    return "confirm_email" as const;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      throw new Error("Sign-in is not configured.");
    }
    try {
      const idToken = await getGoogleIdToken();
      const sb = getSupabase();
      const { data, error } = await withTimeout(
        sb.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        }),
        ID_TOKEN_SIGNIN_MS,
        "signInWithIdToken",
      );
      if (error) throw error;
      setUserAccessToken(data.session?.access_token ?? null);
      setUser(data.user);
      deferAuthSideEffect(convertGuestIfNeeded);
    } catch (e) {
      if (isGoogleNativeError(e)) throw new Error(mapGoogleSignInError(e));
      throw new Error(mapAuthError(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      try {
        await withTimeout(getSupabase().auth.signOut(), 8_000, "signOut");
      } catch {
        await clearLocalSupabaseSession();
      }
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
      googleAvailable: isSupabaseConfigured() && isGoogleSignInConfigured(),
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [ready, user, signIn, signUp, signInWithGoogle, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
