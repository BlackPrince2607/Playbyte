import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { api, isApiError } from "../api";
import { codeFromUrl } from "./friendCode";

const PENDING_KEY = "maja.pendingFriendCode";
const SUCCESS_MS = 6_000;

type AddResult = { status: "added" | "already"; friend: { userId: string; displayName: string } };

export type InviteNotice = { kind: "success" | "error" | "signin"; text: string };

/**
 * Handles opened invite links (https://…/add/CODE or maja://add/CODE). The code is kept on the
 * phone until the player has finished onboarding and signed in, then the friend is added.
 */
export function useFriendInvite({
  active,
  isSignedIn,
  onAdded,
}: {
  active: boolean;
  isSignedIn: boolean;
  onAdded: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<InviteNotice | null>(null);
  const adding = useRef(false);
  const onAddedRef = useRef(onAdded);
  onAddedRef.current = onAdded;

  useEffect(() => {
    let alive = true;
    const take = (url: string | null) => {
      const found = codeFromUrl(url);
      if (!found || !alive) return;
      setCode(found);
      void AsyncStorage.setItem(PENDING_KEY, found).catch(() => {});
    };
    void (async () => {
      const stored = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
      if (stored && alive) setCode((current) => current ?? stored);
      take(await Linking.getInitialURL().catch(() => null));
    })();
    const sub = Linking.addEventListener("url", ({ url }) => take(url));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!code || !active || adding.current) return;
    if (!isSignedIn) {
      setNotice({ kind: "signin", text: "Sign in to add the friend who invited you." });
      return;
    }
    adding.current = true;
    void (async () => {
      try {
        const res = await api<AddResult>("/v1/friends/add", { method: "POST", body: JSON.stringify({ code }) });
        const name = res.friend.displayName;
        setNotice({
          kind: "success",
          text: res.status === "already" ? `You're already friends with ${name}.` : `You're now friends with ${name}!`,
        });
        onAddedRef.current();
      } catch (e) {
        setNotice({ kind: "error", text: isApiError(e) ? e.userMessage : "Couldn't add your friend. Open the invite again." });
      } finally {
        await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
        setCode(null);
        adding.current = false;
      }
    })();
  }, [code, active, isSignedIn]);

  useEffect(() => {
    if (notice?.kind !== "success") return;
    const t = setTimeout(() => setNotice(null), SUCCESS_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const dismiss = useCallback(() => {
    setNotice(null);
    if (!isSignedIn) {
      setCode(null);
      void AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    }
  }, [isSignedIn]);

  return { notice, dismiss };
}
