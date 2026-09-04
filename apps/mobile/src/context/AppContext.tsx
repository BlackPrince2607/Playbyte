import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  ensureGuest,
  FeedItem,
  FeedMoment,
  Friend,
  FriendRequest,
  isApiError,
  loadToken,
  RespondResult,
} from "../api";
import { useAuth } from "./AuthContext";
import { bumpStreak, getStreak, isOnboardingDone, setOnboardingDone } from "../lib/storage";
import { isCacheFresh } from "../lib/cache";
import type { TabKey } from "../components/BottomNav";

export type FriendRequests = { incoming: FriendRequest[]; outgoing: FriendRequest[] };

export type RespondOutcome = { ok: true } | { ok: false; message: string };

type AppState = {
  ready: boolean;
  bootError: string;
  onboardingDone: boolean;
  tab: TabKey;
  items: FeedItem[];
  feedLoading: boolean;
  feedRefreshing: boolean;
  feedError: string;
  streak: number;
  promptSave: boolean;
  respondingIds: ReadonlySet<string>;
  refreshFeed: (force?: boolean) => Promise<void>;
  retryBoot: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setTab: (t: TabKey) => void;
  setPromptSave: (v: boolean) => void;
  respond: (momentId: string, optionId: string) => Promise<RespondOutcome>;
  isResponding: (momentId: string) => boolean;
  jumpToMoment: (id: string) => void;
  feedIndex: number;
  setFeedIndex: (i: number) => void;
  friends: Friend[];
  friendsLoading: boolean;
  friendsError: string;
  refreshFriends: (force?: boolean) => Promise<void>;
  friendRequests: FriendRequests;
  friendRequestsLoading: boolean;
  friendRequestsError: string;
  refreshFriendRequests: (force?: boolean) => Promise<void>;
  friendAvatars: { displayName: string; avatarKey: string | null }[];
  isFeedTabActive: boolean;
};

const Ctx = createContext<AppState | null>(null);

function patchMoment(items: FeedItem[], momentId: string, patch: Partial<FeedMoment>): FeedItem[] {
  return items.map((i) => (i.type === "moment" && i.id === momentId ? { ...i, ...patch } : i));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { ready: authReady, isSignedIn } = useAuth();
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const [onboardingDone, setOnboardingDoneState] = useState(false);
  const [tab, setTab] = useState<TabKey>("feed");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [streak, setStreak] = useState(0);
  const [promptSave, setPromptSave] = useState(false);
  const [feedIndex, setFeedIndex] = useState(0);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [friendRequests, setFriendRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(false);
  const [friendRequestsError, setFriendRequestsError] = useState("");

  const feedInflight = useRef<Promise<void> | null>(null);
  const friendsInflight = useRef<Promise<void> | null>(null);
  const friendRequestsInflight = useRef<Promise<void> | null>(null);
  const hasLoadedFeed = useRef(false);
  const friendsFetchedAt = useRef<number | null>(null);
  const friendRequestsFetchedAt = useRef<number | null>(null);
  const wasSignedIn = useRef<boolean | null>(null);
  const respondingRef = useRef<Set<string>>(new Set());

  const clearUserScopedState = useCallback(() => {
    setFriends([]);
    setFriendsError("");
    setFriendRequests({ incoming: [], outgoing: [] });
    setFriendRequestsError("");
    friendsFetchedAt.current = null;
    friendRequestsFetchedAt.current = null;
  }, []);

  const refreshFriends = useCallback(async (force = false) => {
    if (!isSignedIn) {
      clearUserScopedState();
      return;
    }
    if (!force && isCacheFresh(friendsFetchedAt.current) && friends.length > 0) return;
    if (friendsInflight.current) return friendsInflight.current;

    const run = (async () => {
      setFriendsLoading(true);
      setFriendsError("");
      try {
        const res = await api<{ friends: Friend[] }>("/v1/friends");
        setFriends(res.friends);
        friendsFetchedAt.current = Date.now();
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : "Could not load friends";
        setFriendsError(message);
      } finally {
        setFriendsLoading(false);
      }
    })();

    friendsInflight.current = run;
    try {
      await run;
    } finally {
      if (friendsInflight.current === run) friendsInflight.current = null;
    }
  }, [isSignedIn, friends.length, clearUserScopedState]);

  const refreshFriendRequests = useCallback(async (force = false) => {
    if (!isSignedIn) {
      setFriendRequests({ incoming: [], outgoing: [] });
      setFriendRequestsError("");
      friendRequestsFetchedAt.current = null;
      return;
    }
    if (!force && isCacheFresh(friendRequestsFetchedAt.current)) return;
    if (friendRequestsInflight.current) return friendRequestsInflight.current;

    const run = (async () => {
      setFriendRequestsLoading(true);
      setFriendRequestsError("");
      try {
        const res = await api<FriendRequests>("/v1/friends/requests");
        setFriendRequests(res);
        friendRequestsFetchedAt.current = Date.now();
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : "Could not load requests";
        setFriendRequestsError(message);
      } finally {
        setFriendRequestsLoading(false);
      }
    })();

    friendRequestsInflight.current = run;
    try {
      await run;
    } finally {
      if (friendRequestsInflight.current === run) friendRequestsInflight.current = null;
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!authReady) return;
    if (isSignedIn) {
      void refreshFriends();
      void refreshFriendRequests();
    } else {
      clearUserScopedState();
    }
  }, [authReady, isSignedIn, refreshFriends, refreshFriendRequests, clearUserScopedState]);

  const friendAvatars = useMemo(
    () => friends.map((f) => ({ displayName: f.displayName, avatarKey: f.avatarKey })),
    [friends],
  );

  const loadFeed = useCallback(async (opts?: { force?: boolean; refreshing?: boolean }) => {
    const force = opts?.force ?? false;
    const refreshing = opts?.refreshing ?? false;

    if (feedInflight.current && !force) return feedInflight.current;

    const run = (async () => {
      if (refreshing) setFeedRefreshing(true);
      else if (!hasLoadedFeed.current) setFeedLoading(true);
      setFeedError("");

      try {
        const feed = await api<{ items: FeedItem[] }>("/v1/feed?limit=20");
        setItems(feed.items);
        hasLoadedFeed.current = true;
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : "Could not load feed";
        setFeedError(message);
        throw e;
      } finally {
        setFeedLoading(false);
        setFeedRefreshing(false);
      }
    })();

    feedInflight.current = run;
    try {
      await run;
    } finally {
      if (feedInflight.current === run) feedInflight.current = null;
    }
  }, []);

  const refreshFeed = useCallback(
    async (force = false) => {
      await loadFeed({ force, refreshing: hasLoadedFeed.current });
    },
    [loadFeed],
  );

  useEffect(() => {
    if (!authReady) return;
    if (wasSignedIn.current === null) {
      wasSignedIn.current = isSignedIn;
      return;
    }
    if (wasSignedIn.current === isSignedIn) return;
    wasSignedIn.current = isSignedIn;
    if (isSignedIn) {
      void refreshFriends(true);
      void refreshFriendRequests(true);
    } else {
      clearUserScopedState();
    }
    void refreshFeed(true);
  }, [authReady, isSignedIn, refreshFriends, refreshFriendRequests, clearUserScopedState, refreshFeed]);

  const boot = useCallback(async () => {
    setBootError("");
    try {
      await loadToken();
      await ensureGuest();
      const done = await isOnboardingDone();
      setOnboardingDoneState(done);
      setStreak(await getStreak());
      await loadFeed();
      setReady(true);
    } catch (e) {
      const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : "Could not start";
      setBootError(message);
      setReady(true);
    }
  }, [loadFeed]);

  useEffect(() => {
    if (!authReady) return;
    void boot();
  }, [authReady, boot]);

  const retryBoot = useCallback(async () => {
    setReady(false);
    await boot();
  }, [boot]);

  const completeOnboarding = useCallback(async () => {
    await setOnboardingDone();
    setOnboardingDoneState(true);
    await refreshFeed(true);
  }, [refreshFeed]);

  const respond = useCallback(
    async (momentId: string, optionId: string): Promise<RespondOutcome> => {
      if (respondingRef.current.has(momentId)) {
        return { ok: false, message: "Already submitting…" };
      }
      respondingRef.current.add(momentId);
      setRespondingIds(new Set(respondingRef.current));
      try {
        const res = await api<RespondResult>(`/v1/moments/${momentId}/responses`, {
          method: "POST",
          headers: { "Idempotency-Key": `${momentId}-${optionId}` },
          body: JSON.stringify({ optionId }),
        });
        setPromptSave(Boolean(res.promptAccountCreation));
        const s = await bumpStreak();
        setStreak(s);
        setItems((prev) =>
          patchMoment(prev, momentId, {
            myOptionId: res.optionId,
            result: res.result ?? undefined,
          }),
        );
        return { ok: true };
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : "Could not submit";
        return { ok: false, message };
      } finally {
        respondingRef.current.delete(momentId);
        setRespondingIds(new Set(respondingRef.current));
      }
    },
    [],
  );

  const isResponding = useCallback(
    (momentId: string) => respondingIds.has(momentId),
    [respondingIds],
  );

  const jumpToMoment = useCallback(
    (id: string) => {
      const idx = items.findIndex((i) => i.type === "moment" && i.id === id);
      if (idx >= 0) {
        setFeedIndex(idx);
        setTab("feed");
      }
    },
    [items],
  );

  const value = useMemo(
    () => ({
      ready,
      bootError,
      onboardingDone,
      tab,
      items,
      feedLoading,
      feedRefreshing,
      feedError,
      streak,
      promptSave,
      respondingIds,
      refreshFeed,
      retryBoot,
      completeOnboarding,
      setTab,
      setPromptSave,
      respond,
      isResponding,
      jumpToMoment,
      feedIndex,
      setFeedIndex,
      friends,
      friendsLoading,
      friendsError,
      refreshFriends,
      friendRequests,
      friendRequestsLoading,
      friendRequestsError,
      refreshFriendRequests,
      friendAvatars,
      isFeedTabActive: tab === "feed",
    }),
    [
      ready,
      bootError,
      onboardingDone,
      tab,
      items,
      feedLoading,
      feedRefreshing,
      feedError,
      streak,
      promptSave,
      respondingIds,
      refreshFeed,
      retryBoot,
      completeOnboarding,
      respond,
      isResponding,
      jumpToMoment,
      feedIndex,
      friends,
      friendsLoading,
      friendsError,
      refreshFriends,
      friendRequests,
      friendRequestsLoading,
      friendRequestsError,
      refreshFriendRequests,
      friendAvatars,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function isMoment(item: FeedItem): item is FeedMoment {
  return item.type === "moment";
}
