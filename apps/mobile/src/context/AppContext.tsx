import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState as RNAppState } from "react-native";
import {
  api,
  CrowdSnapshot,
  ensureGuest,
  FeedItem,
  FeedMoment,
  Friend,
  FriendRequest,
  isApiError,
  loadToken,
  MeProfile,
  MomentEngagement,
  RespondResult,
} from "../api";
import { isPlayable } from "../game/discovery";
import { appendFeedPage, FEED_PREFETCH_AHEAD } from "../lib/feedPages";
import type { CoinCredit, CoinCreditReason, WalletSnapshot } from "../lib/economy";
import { initPurchases } from "../lib/purchases";
import {
  clearOnboardingDone,
  getOnboardingStep,
  getStreak,
  getStreakDate,
  isOnboardingDone,
  recordDailyVisit,
  setOnboardingDone,
  setOnboardingStep as persistOnboardingStep,
  type OnboardingStep,
} from "../lib/storage";
import {
  capture,
  markOnboardingStart,
  onboardingDurationSeconds,
  trackAppOpened,
} from "../lib/analytics";
import { claimStreak, fetchWallet } from "../lib/walletApi";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";
import { isCacheFresh } from "../lib/cache";
import type { TabKey } from "../components/BottomNav";

export type { OnboardingStep };

export type FriendRequests = { incoming: FriendRequest[]; outgoing: FriendRequest[] };

export type MySummary = { displayName: string; avatarKey: string | null };

export type RespondOutcome =
  | { ok: true; result: CrowdSnapshot | null }
  | { ok: false; message: string };

type AppState = {
  ready: boolean;
  bootError: string;
  onboardingDone: boolean;
  onboardingStep: OnboardingStep;
  tab: TabKey;
  items: FeedItem[];
  feedLoading: boolean;
  feedRefreshing: boolean;
  feedError: string;
  streak: number;
  promptSave: boolean;
  respondingIds: ReadonlySet<string>;
  refreshFeed: (force?: boolean) => Promise<void>;
  loadMoreFeed: (viewerIndex?: number) => Promise<void>;
  retryBoot: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** Re-open profile/interests after a guest later signs in without having set them up. */
  resumeOnboarding: (step?: OnboardingStep) => Promise<void>;
  setOnboardingStep: (step: OnboardingStep) => void;
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
  /** Signed-in player's name and photo for the top bars; null for guests. */
  me: MySummary | null;
  updateMe: (patch: Partial<MySummary>) => void;
  isFeedTabActive: boolean;
  /** Latest like / share / comment counts per moment; falls back to the feed payload. */
  engagementFor: (moment: FeedMoment) => MomentEngagement;
  updateEngagement: (momentId: string, patch: Partial<MomentEngagement>) => void;
  wallet: WalletSnapshot | null;
  /** Latest coin credit for toast / wallet pulse; null when idle. */
  coinCredit: CoinCredit | null;
  applyWallet: (next: WalletSnapshot, earned?: number, reason?: CoinCreditReason) => void;
  refreshWallet: () => Promise<void>;
  noteBalance: (balance: number) => void;
  /** Apply a server earn (game / poll / streak / purchase) to the on-screen balance and toast. */
  noteEarn: (
    balance: number | null | undefined,
    earned?: number,
    kind?: CoinCreditReason,
    meta?: { gameId?: string; itemId?: string },
  ) => void;
};

const EMPTY_ENGAGEMENT: MomentEngagement = { likes: 0, shares: 0, comments: 0, likedByMe: false };

const Ctx = createContext<AppState | null>(null);

/** Coming back sooner than this (share sheet, Google sign-in) keeps the feed where it was. */
const REOPEN_REFRESH_AFTER_MS = 30_000;

function feedPath(lang: string, cursor?: string | null) {
  const base = `/v1/feed?limit=20&lang=${encodeURIComponent(lang)}`;
  return cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
}
/** Pages fetched in one go while the viewer is short of cards ahead (pages can add few once repeats are dropped). */
const MAX_PAGES_PER_LOAD = 4;
/** Failed page fetches retried with doubling backoff, so a viewer parked on the last card is not stranded. */
const MAX_FEED_RETRIES = 4;
const FEED_RETRY_MS = 1000;

type FeedPage = { items: FeedItem[]; cursor: string | null };

const isShowable = (i: FeedItem) => i.type !== "mini_game" || isPlayable(i);

function patchMoment(items: FeedItem[], momentId: string, patch: Partial<FeedMoment>): FeedItem[] {
  return items.map((i) => (i.type === "moment" && i.id === momentId ? { ...i, ...patch } : i));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { language, ready: languageReady, t } = useLanguage();
  const languageRef = useRef(language);
  languageRef.current = language;
  const tRef = useRef(t);
  tRef.current = t;
  const { ready: authReady, isSignedIn, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const [onboardingDone, setOnboardingDoneState] = useState(false);
  const [onboardingStep, setOnboardingStepState] = useState<OnboardingStep>("language");
  const [tab, setTab] = useState<TabKey>("feed");
  const [items, setItems] = useState<FeedItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [streak, setStreak] = useState(0);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [coinCredit, setCoinCredit] = useState<CoinCredit | null>(null);
  const creditSeq = useRef(0);
  const [promptSave, setPromptSave] = useState(false);
  const [feedIndex, setFeedIndex] = useState(0);
  const feedIndexRef = useRef(feedIndex);
  feedIndexRef.current = feedIndex;
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [engagement, setEngagement] = useState<Record<string, MomentEngagement>>({});
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [friendRequests, setFriendRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(false);
  const [friendRequestsError, setFriendRequestsError] = useState("");
  const [me, setMe] = useState<MySummary | null>(null);

  const feedInflight = useRef<Promise<void> | null>(null);
  const moreInflight = useRef<Promise<void> | null>(null);
  /** Bumped whenever the feed is replaced, so a page fetched for the old feed is dropped. */
  const feedGeneration = useRef(0);
  /** Where the server resumes the feed; null once it has nothing more to show. */
  const feedCursor = useRef<string | null>(null);
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
    setMe(null);
    setWallet(null);
    friendsFetchedAt.current = null;
    friendRequestsFetchedAt.current = null;
  }, []);

  const updateMe = useCallback((patch: Partial<MySummary>) => {
    setMe((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const showCoinCredit = useCallback((amount: number, reason: CoinCreditReason) => {
    if (amount <= 0) return;
    creditSeq.current += 1;
    setCoinCredit({ amount, reason, id: creditSeq.current });
  }, []);

  const applyWallet = useCallback(
    (next: WalletSnapshot, earned = 0, reason: CoinCreditReason = "reward") => {
      setWallet(next);
      setStreak(next.streak);
      if (earned > 0) {
        showCoinCredit(earned, reason);
        capture("coin_earned", { amount: earned, reason, game_id: null });
      }
    },
    [showCoinCredit],
  );

  const noteBalance = useCallback((balance: number) => {
    setWallet((current) => (current ? { ...current, balance } : current));
  }, []);

  const noteEarn = useCallback(
    (
      balance: number | null | undefined,
      earned = 0,
      kind?: CoinCreditReason,
      meta?: { gameId?: string; itemId?: string },
    ) => {
      if (typeof balance === "number" || earned > 0) {
        setWallet((current) => {
          if (!current) {
            if (typeof balance !== "number") return current;
            return {
              balance,
              streak: 0,
              bestStreak: 0,
              freezes: 0,
              freeHintsLeft: 0,
              freeHintsPerDay: 3,
              freezeCost: 40,
              todayReward: 0,
              streakClaimed: false,
              nextMilestone: null,
              gamesRewarded: kind === "game" && earned > 0 ? 1 : 0,
              gamesRewardCap: 8,
              momentsRewarded: kind === "moment" && earned > 0 ? 1 : 0,
              momentsRewardCap: 10,
              packs: [],
            };
          }
          const next = { ...current };
          if (typeof balance === "number") next.balance = balance;
          if (earned > 0 && kind === "game") {
            next.gamesRewarded = Math.min(current.gamesRewardCap, current.gamesRewarded + 1);
          }
          if (earned > 0 && kind === "moment") {
            next.momentsRewarded = Math.min(current.momentsRewardCap, current.momentsRewarded + 1);
          }
          return next;
        });
      }
      if (earned > 0) {
        const reason = kind ?? "reward";
        showCoinCredit(earned, reason);
        capture("coin_earned", {
          amount: earned,
          reason,
          game_id: meta?.gameId ?? null,
          item_id: meta?.itemId ?? null,
        });
      }
    },
    [showCoinCredit],
  );

  const refreshWallet = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const next = await fetchWallet();
      setWallet(next);
      setStreak(next.streak);
    } catch {
      /* keep the last balance on screen */
    }
  }, [isSignedIn]);

  const syncEconomy = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const [profile, count, storedDate] = await Promise.all([
        api<MeProfile>("/v1/me"),
        getStreak(),
        getStreakDate(),
      ]);
      setMe({ displayName: profile.displayName, avatarKey: profile.avatarKey });
      void initPurchases(profile.id);
      const next = await claimStreak({
        migrateCount: count > 0 ? count : undefined,
        migrateDate: storedDate ?? undefined,
      });
      applyWallet(next, next.coinsEarned ?? 0, "streak");
    } catch {
      setStreak(await recordDailyVisit());
    }
  }, [isSignedIn, applyWallet]);

  useEffect(() => {
    if (!coinCredit) return;
    const id = setTimeout(() => setCoinCredit(null), 2200);
    return () => clearTimeout(id);
  }, [coinCredit]);

  const loadMe = useCallback(async () => {
    try {
      const profile = await api<MeProfile>("/v1/me");
      setMe({ displayName: profile.displayName, avatarKey: profile.avatarKey });
    } catch {
      /* the top bar falls back to initials */
    }
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
      void loadMe();
    } else {
      clearUserScopedState();
    }
  }, [authReady, isSignedIn, refreshFriends, refreshFriendRequests, loadMe, clearUserScopedState]);

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
        const feed = await api<FeedPage>(feedPath(languageRef.current));
        feedGeneration.current += 1;
        feedCursor.current = feed.cursor;
        setItems(feed.items.filter(isShowable));
        setEngagement({});
        hasLoadedFeed.current = true;
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : tRef.current("couldNotLoadFeed");
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

  const loadMoreFeed = useCallback(async (viewerIndex?: number) => {
    if (!hasLoadedFeed.current || feedInflight.current || moreInflight.current) return;
    const generation = feedGeneration.current;
    const run = (async () => {
      let list = itemsRef.current;
      const shortOfCards = () =>
        list.length - 1 - Math.max(feedIndexRef.current, viewerIndex ?? 0) <= FEED_PREFETCH_AHEAD;
      let pages = 0;
      let failures = 0;
      while (feedCursor.current && pages < MAX_PAGES_PER_LOAD && shortOfCards()) {
        try {
          const feed = await api<FeedPage>(feedPath(languageRef.current, feedCursor.current));
          if (generation !== feedGeneration.current) return;
          pages += 1;
          failures = 0;
          feedCursor.current = feed.cursor;
          const page = feed.items.filter(isShowable);
          list = appendFeedPage(list, page);
          setItems((prev) => appendFeedPage(prev, page));
        } catch {
          if (++failures > MAX_FEED_RETRIES) return;
          await new Promise((resolve) => setTimeout(resolve, FEED_RETRY_MS * 2 ** (failures - 1)));
          if (generation !== feedGeneration.current) return;
        }
      }
    })();
    moreInflight.current = run;
    try {
      await run;
    } finally {
      moreInflight.current = null;
    }
  }, []);

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
      if (!done) {
        setOnboardingStepState(await getOnboardingStep());
      }
      try {
        await loadFeed();
      } catch {
        /* feedError set inside loadFeed */
      }
      setReady(true);
    } catch (e) {
      const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : tRef.current("couldNotStart");
      setBootError(message);
      setReady(true);
    }
  }, [loadFeed]);

  useEffect(() => {
    if (!authReady || !languageReady) return;
    void boot();
  }, [authReady, languageReady, boot]);

  useEffect(() => {
    if (!ready || !authReady) return;
    if (isSignedIn) void syncEconomy();
    else {
      setWallet(null);
      void recordDailyVisit().then(setStreak);
    }
  }, [ready, authReady, isSignedIn, syncEconomy]);

  useEffect(() => {
    if (!ready) return;
    trackAppOpened("cold", user?.id ?? null);
    if (!onboardingDone) markOnboardingStart();
  }, [ready, user?.id, onboardingDone]);

  const seenLang = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !languageReady) return;
    if (seenLang.current === null) {
      seenLang.current = language;
      return;
    }
    if (seenLang.current === language) return;
    seenLang.current = language;
    void refreshFeed(true);
  }, [language, ready, languageReady, refreshFeed]);

  // Reopening the app shows a fresh feed from the first post.
  useEffect(() => {
    if (!ready || !onboardingDone) return;
    let backgroundedAt: number | null = null;
    const sub = RNAppState.addEventListener("change", (s) => {
      if (s === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (s !== "active" || backgroundedAt === null) return;
      trackAppOpened("warm", user?.id ?? null);
      if (isSignedIn) void syncEconomy();
      else void recordDailyVisit().then(setStreak);
      const away = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (away < REOPEN_REFRESH_AFTER_MS) return;
      refreshFeed(true).then(
        () => setFeedIndex(0),
        () => {},
      );
    });
    return () => sub.remove();
  }, [ready, onboardingDone, refreshFeed, isSignedIn, syncEconomy, user?.id]);

  const retryBoot = useCallback(async () => {
    setReady(false);
    setBootError("");
    await boot();
  }, [boot]);

  const setOnboardingStep = useCallback((step: OnboardingStep) => {
    setOnboardingStepState(step);
    void persistOnboardingStep(step);
  }, []);

  const completeOnboarding = useCallback(async () => {
    capture("onboarding_completed", {
      duration_seconds: onboardingDurationSeconds(),
      language,
    });
    await setOnboardingDone();
    setOnboardingDoneState(true);
    setOnboardingStepState("language");
    setBootError("");
    try {
      await refreshFeed(true);
    } catch {
      // feedError already set — main app can retry; do not leave onboarding incomplete
    }
  }, [refreshFeed, language]);

  const resumeOnboarding = useCallback(async (step: OnboardingStep = "profile") => {
    await clearOnboardingDone();
    await persistOnboardingStep(step);
    setOnboardingDoneState(false);
    setOnboardingStepState(step);
  }, []);

  const respond = useCallback(
    async (momentId: string, optionId: string): Promise<RespondOutcome> => {
      if (respondingRef.current.has(momentId)) {
        return { ok: false, message: tRef.current("alreadySubmitting") };
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
        noteEarn(res.balance, res.coinsEarned ?? 0, "moment", { itemId: momentId });
        setItems((prev) =>
          patchMoment(prev, momentId, {
            myOptionId: res.optionId,
            result: res.result ?? undefined,
          }),
        );
        return { ok: true, result: res.result };
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : tRef.current("couldNotSubmit");
        return { ok: false, message };
      } finally {
        respondingRef.current.delete(momentId);
        setRespondingIds(new Set(respondingRef.current));
      }
    },
    [noteEarn],
  );

  const isResponding = useCallback(
    (momentId: string) => respondingIds.has(momentId),
    [respondingIds],
  );

  const engagementFor = useCallback(
    (m: FeedMoment) => engagement[m.id] ?? m.engagement ?? EMPTY_ENGAGEMENT,
    [engagement],
  );

  const updateEngagement = useCallback(
    (momentId: string, patch: Partial<MomentEngagement>) => {
      setEngagement((prev) => {
        const base =
          prev[momentId] ??
          items.find((i): i is FeedMoment => i.type === "moment" && i.id === momentId)?.engagement ??
          EMPTY_ENGAGEMENT;
        return { ...prev, [momentId]: { ...base, ...patch } };
      });
    },
    [items],
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
      onboardingStep,
      tab,
      items,
      feedLoading,
      feedRefreshing,
      feedError,
      streak,
      promptSave,
      respondingIds,
      refreshFeed,
      loadMoreFeed,
      retryBoot,
      completeOnboarding,
      resumeOnboarding,
      setOnboardingStep,
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
      me,
      updateMe,
      isFeedTabActive: tab === "feed",
      engagementFor,
      updateEngagement,
      wallet,
      coinCredit,
      applyWallet,
      refreshWallet,
      noteBalance,
      noteEarn,
    }),
    [
      ready,
      bootError,
      onboardingDone,
      onboardingStep,
      tab,
      items,
      feedLoading,
      feedRefreshing,
      feedError,
      streak,
      promptSave,
      respondingIds,
      refreshFeed,
      loadMoreFeed,
      retryBoot,
      completeOnboarding,
      resumeOnboarding,
      setOnboardingStep,
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
      me,
      updateMe,
      engagementFor,
      updateEngagement,
      wallet,
      coinCredit,
      applyWallet,
      refreshWallet,
      noteBalance,
      noteEarn,
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
