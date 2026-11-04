import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthError, User } from "@supabase/supabase-js";
import {
  api,
  clearGuestToken,
  ensureGuest,
  getGuestToken,
  getUserAccessToken,
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
import { identify, resetAnalytics } from "../lib/analytics";
import { logOutPurchases } from "../lib/purchases";
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
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const AUTH_INIT_BUDGET_MS = 6_000;
const GET_SESSION_MS = 4_000;
const REFRESH_SESSION_MS = 12_000;
const ID_TOKEN_SIGNIN_MS = 15_000;
/** Refresh when access token is already expired or within this window. */
const REFRESH_SKEW_MS = 60_000;

function isRefreshTokenDead(error: unknown): boolean {
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "").toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : "";
  return (
    msg.includes("invalid refresh") ||
    msg.includes("refresh token not found") ||
    msg.includes("session not found") ||
    msg.includes("already used")
  );
}

function sessionNeedsRefresh(expiresAtSec: number | undefined): boolean {
  if (!expiresAtSec) return true;
  return expiresAtSec * 1000 < Date.now() + REFRESH_SKEW_MS;
}

export function mapAuthError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as AuthError).message || "");
    const lower = msg.toLowerCase();
    if (lower.includes("provider") && lower.includes("not enabled")) {
      return "Google Sign-In is not enabled on the server yet. Ask the team to enable Google in Supabase.";
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
    if (msg) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not authenticate.";
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
  /** Coalesce concurrent 401 recoveries onto one refresh (avoids refresh-token rotation races). */
  const recoverInflight = useRef<Promise<boolean> | null>(null);
  /** Access token we last applied via 401 recovery — a second 401 with the same token demotes. */
  const recoverAppliedToken = useRef<string | null>(null);

  const markReady = useCallback(() => {
    if (readyOnce.current) return;
    readyOnce.current = true;
    setReady(true);
  }, []);

  const demoteToGuest = useCallback(async (): Promise<boolean> => {
    await clearLocalSupabaseSession();
    setUserAccessToken(null);
    setUser(null);
    recoverAppliedToken.current = null;
    try {
      clearGuestToken();
      await ensureGuest({ forceNew: true });
      return true;
    } catch {
      return false;
    }
  }, []);

  const recoverFrom401 = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured()) {
      setUserAccessToken(null);
      setUser(null);
      try {
        await ensureGuest({ forceNew: true });
        return true;
      } catch {
        return false;
      }
    }

    if (recoverInflight.current) return recoverInflight.current;

    recoverInflight.current = (async () => {
      try {
        const before = getUserAccessToken();
        // Same token already refreshed for a prior 401 in this wave → backend still rejects JWT.
        if (before && recoverAppliedToken.current === before) {
          console.warn("[auth] 401 after refresh — demoting to guest");
          return demoteToGuest();
        }

        const sb = getSupabase();
        const { data, error } = await withTimeout(
          sb.auth.refreshSession(),
          REFRESH_SESSION_MS,
          "refreshSession",
        );

        if (!error && data.session?.access_token) {
          const next = data.session.access_token;
          setUserAccessToken(next);
          setUser(data.session.user);
          recoverAppliedToken.current = next;
          return true;
        }

        if (isRefreshTokenDead(error)) {
          // Rotation race: another refresh may have already persisted a new session.
          try {
            const { data: existing } = await sb.auth.getSession();
            const token = sessionAccessToken(existing.session);
            if (token && token !== before) {
              setUserAccessToken(token);
              setUser(existing.session?.user ?? null);
              recoverAppliedToken.current = token;
              return true;
            }
          } catch {
            /* fall through to demote */
          }
          console.warn("[auth] refresh token unusable — demoting to guest", error);
          return demoteToGuest();
        }

        // Network / unknown refresh failure — keep persisted session; fail this request.
        console.warn("[auth] refreshSession failed transiently — keeping session", error);
        return false;
      } catch (e) {
        // Timeout / offline — never wipe the refresh token on a flaky launch.
        console.warn("[auth] refreshSession error — keeping session", e);
        return false;
      } finally {
        recoverInflight.current = null;
      }
    })();

    return recoverInflight.current;
  }, [demoteToGuest]);

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
            if (event === "SIGNED_IN") recoverAppliedToken.current = null;
            if (next && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
              deferAuthSideEffect(convertGuestIfNeeded);
            } else if (!next && event === "SIGNED_OUT") {
              recoverAppliedToken.current = null;
              deferAuthSideEffect(async () => {
                await ensureGuest();
              });
            }
          });
          unsub = () => sub.subscription.unsubscribe();

          try {
            const { data } = await withTimeout(sb.auth.getSession(), GET_SESSION_MS, "getSession");
            if (initId !== authInitId.current) return;
            let session = data.session;
            setUserAccessToken(sessionAccessToken(session));
            setUser(session?.user ?? null);

            // After hours idle the access JWT is expired; refresh before API traffic starts.
            if (session?.refresh_token && sessionNeedsRefresh(session.expires_at)) {
              try {
                const refreshed = await withTimeout(
                  sb.auth.refreshSession(),
                  REFRESH_SESSION_MS,
                  "refreshSession",
                );
                if (initId !== authInitId.current) return;
                if (!refreshed.error && refreshed.data.session) {
                  session = refreshed.data.session;
                  setUserAccessToken(sessionAccessToken(session));
                  setUser(session.user);
                  recoverAppliedToken.current = null;
                } else if (isRefreshTokenDead(refreshed.error)) {
                  console.warn("[auth] stored refresh token dead on boot", refreshed.error);
                  await clearLocalSupabaseSession();
                  if (initId !== authInitId.current) return;
                  setUserAccessToken(null);
                  setUser(null);
                }
              } catch (e) {
                console.warn("[auth] proactive refresh failed — keeping stored session", e);
              }
            }
          } catch (e) {
            // Timeout/hang must not delete the persisted refresh token — that was logging users out.
            console.warn("[auth] getSession failed — keeping persisted session", e);
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
            const guest = getGuestToken();
            // Prefer the auth-state identify effect for signed-in users.
            if (guest && !getUserAccessToken()) identify(`guest:${guest}`);
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

  // Keep PostHog distinct_id aligned with the signed-in user or guest token.
  useEffect(() => {
    if (!ready) return;
    if (user?.id) {
      identify(user.id, { email: user.email ?? null });
      return;
    }
    const guest = getGuestToken();
    if (guest) identify(`guest:${guest}`);
  }, [ready, user]);

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
      recoverAppliedToken.current = null;
      await convertGuestIfNeeded();
    } catch (e) {
      if (isGoogleNativeError(e)) throw new Error(mapGoogleSignInError(e));
      throw new Error(mapAuthError(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    await logOutPurchases();
    if (isSupabaseConfigured()) {
      try {
        await withTimeout(getSupabase().auth.signOut(), 8_000, "signOut");
      } catch {
        await clearLocalSupabaseSession();
      }
    }
    setUserAccessToken(null);
    setUser(null);
    recoverAppliedToken.current = null;
    resetAnalytics();
    await ensureGuest({ forceNew: true });
    const guest = getGuestToken();
    if (guest) identify(`guest:${guest}`);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      isSignedIn: Boolean(user),
      googleAvailable: isSupabaseConfigured() && isGoogleSignInConfigured(),
      signInWithGoogle,
      signOut,
    }),
    [ready, user, signInWithGoogle, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
