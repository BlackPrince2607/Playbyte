import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { api, FeedGame, isApiError, type OnlineMatch } from "./api";
import { BottomNav, TabKey } from "./components/BottomNav";
import { CloseButton } from "./components/CloseButton";
import { CoinToast } from "./components/CoinToast";
import { ErrorState } from "./components/ErrorState";
import { MajaLogo } from "./components/MajaLogo";
import { PrimaryButton } from "./components/PrimaryButton";
import { ScreenLoading } from "./components/ScreenLoading";
import { WalletSheet } from "./components/WalletSheet";
import { useApp } from "./context/AppContext";
import { useLanguage } from "./context/LanguageContext";
import { localizeGame } from "./i18n/games";
import { nextGame } from "./game/discovery";
import { startGameAnalytics } from "./game/platform/analytics";
import { randomSeed } from "./game/core/rng";
import { engineRegistry } from "./game/engines";
import { registerEngines } from "./game/engines/manifest";
import { sessionStore, submitQueue } from "./game/platform/services";
import { savePlay as submitAndDescribe, type SaveOutcome } from "./game/session/submitQueue";
import type { CompletedPlay, GameSession } from "./game/session/types";
import { GameHost } from "./game/ui/GameHost";
import type { EngineHowToProps } from "./game/ui/types";
import { FeedScreen } from "./screens/feed/FeedScreen";
import { PostGameResultScreen } from "./screens/feed/PostGameResultScreen";
import { StreakScreen } from "./screens/feed/StreakScreen";
import { FriendsScreen } from "./screens/friends/FriendsScreen";
import { LeaderboardScreen } from "./screens/friends/LeaderboardScreen";
import { BattleFlow } from "./screens/battle/BattleFlow";
import { InterestsScreen } from "./screens/onboarding/InterestsScreen";
import { LanguageScreen } from "./screens/onboarding/LanguageScreen";
import { ProfileSetupScreen } from "./screens/onboarding/ProfileSetupScreen";
import { WelcomeScreen } from "./screens/onboarding/WelcomeScreen";
import { NotificationsScreen } from "./screens/profile/NotificationsScreen";
import { SettingsScreen } from "./screens/profile/SettingsScreen";
import { WeeklyRecapScreen } from "./screens/profile/WeeklyRecapScreen";
import { SignInScreen } from "./screens/auth/SignInScreen";
import { useAuth } from "./context/AuthContext";
import {
  hasSeenEngineHowTo,
  markEngineHowToSeen,
  shouldOfferPostPlayHowTo,
} from "./lib/howtoStorage";
import { clearLocalSupabaseSession, isSupabaseConfigured } from "./lib/supabase";
import {
  capture,
  gamePlayProps,
  markOnboardingStart,
  noteGameCompletedAnalytics,
  trackScreen,
} from "./lib/analytics";
import { getGamesCompletedLifetime, markDay0AppointmentShown, shouldShowDay0Appointment } from "./lib/retentionStorage";
import { startStreakReminderListener } from "./lib/streakReminders";
import { useFriendInvite } from "./lib/useFriendInvite";
import { colors, spacing } from "./theme/colors";
import { type } from "./theme/typography";

type DuelOpponent = { displayName: string; avatarKey: string | null };
type ActiveChallenge = { id: string; seed: string; opponent?: DuelOpponent };
type ActiveMatch = { id: string; seed: string; opponent?: DuelOpponent };
type GameResult = SaveOutcome & { game: FeedGame; play: CompletedPlay };
type PendingPostPlayHowTo = {
  engineId: string;
  title: string;
  HowTo: ComponentType<EngineHowToProps>;
};

function rivalFromMatch(m: OnlineMatch | ActiveMatch | null | undefined): DuelOpponent | undefined {
  if (!m) return undefined;
  if ("opponent" in m && m.opponent) {
    return { displayName: m.opponent.displayName, avatarKey: m.opponent.avatarKey ?? null };
  }
  return undefined;
}

type MatchmakingSheetProps = {
  visible: boolean;
  gameKey: string;
  gameTitle: string;
  signedIn: boolean;
  onNeedSignIn: () => void;
  onClose: () => void;
  onMatched: (match: OnlineMatch) => void;
};

/** Lazy so a matchmaking module fault cannot take down cold start. */
function LazyMatchmakingSheet(props: MatchmakingSheetProps) {
  const [Sheet, setSheet] = useState<ComponentType<MatchmakingSheetProps> | null>(null);
  useEffect(() => {
    if (!props.visible || Sheet) return;
    let alive = true;
    void import("./components/MatchmakingSheet")
      .then((m) => {
        if (alive) setSheet(() => m.MatchmakingSheet);
      })
      .catch((e) => console.error("MatchmakingSheet load failed", e));
    return () => {
      alive = false;
    };
  }, [props.visible, Sheet]);
  if (!Sheet) return null;
  return <Sheet {...props} />;
}

type IntroSlidesProps = {
  page: number;
  onPageChange: (page: number) => void;
  onBack: () => void;
  onNext: () => void;
};

/** Defers Skia-heavy preview cards until the intro step actually opens. */
function LazyIntroSlides(props: IntroSlidesProps) {
  const [Screen, setScreen] = useState<ComponentType<IntroSlidesProps> | null>(null);
  useEffect(() => {
    let alive = true;
    void import("./screens/onboarding/IntroSlidesScreen")
      .then((m) => {
        if (alive) setScreen(() => m.IntroSlidesScreen);
      })
      .catch((e) => console.error("IntroSlidesScreen load failed", e));
    return () => {
      alive = false;
    };
  }, []);
  if (!Screen) {
    return (
      <View style={styles.center}>
        <ScreenLoading style={{ flex: 0 }} />
      </View>
    );
  }
  return <Screen {...props} />;
}

function BootLoading({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  const [showRetry, setShowRetry] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowRetry(true), 8_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.center}>
      <MajaLogo size="lg" />
      <ScreenLoading style={{ flex: 0, paddingTop: spacing.md }} />
      {showRetry ? (
        <View style={{ marginTop: 24, paddingHorizontal: 32, alignItems: "center", gap: 12 }}>
          <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
            Still starting up. You can retry — this clears a stuck sign-in session if needed.
          </Text>
          <PrimaryButton label={t("retry")} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function MainShell() {
  const {
    ready,
    bootError,
    onboardingDone,
    onboardingStep,
    setOnboardingStep,
    tab,
    setTab,
    promptSave,
    setPromptSave,
    completeOnboarding,
    resumeOnboarding,
    refreshFeed,
    retryBoot,
    items,
    noteEarn,
    refreshWallet,
    refreshFriends,
    refreshFriendRequests,
    me,
  } = useApp();
  const { googleAvailable, signInWithGoogle, isSignedIn, user } = useAuth();
  const { t, language, fonts: ui } = useLanguage();
  const [playing, setPlaying] = useState<FeedGame | null>(null);
  /** Fresh each solo start so remounts and procedural generators never reuse the prior set. */
  const [playSeed, setPlaySeed] = useState<string | undefined>(undefined);
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallenge | null>(null);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [onlineSearchGame, setOnlineSearchGame] = useState<FeedGame | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  /** First completed inline play of an engine — HowTo before result. */
  const [pendingPostPlayHowTo, setPendingPostPlayHowTo] = useState<PendingPostPlayHowTo | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showInterests, setShowInterests] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  /** Friends tab → Compete: preselect this friend for the challenge flow. */
  const [battleFriendId, setBattleFriendId] = useState<string | null>(null);
  const [gameSubmitting, setGameSubmitting] = useState(false);
  const [resumable, setResumable] = useState<GameSession | null>(null);
  const [restoring, setRestoring] = useState<GameSession | undefined>(undefined);
  const [welcomeAuthBusy, setWelcomeAuthBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [introPage, setIntroPage] = useState(0);
  const [finishingOnboarding, setFinishingOnboarding] = useState(false);
  /** Bumped when Feed is tapped while already on Feed — scroll the pager to the first card. */
  const [feedTopNonce, setFeedTopNonce] = useState(0);
  const wasSignedIn = useRef<boolean | null>(null);

  const showNewFriend = useCallback(() => {
    void refreshFriends(true);
    void refreshFriendRequests(true);
    setTab("friends");
  }, [refreshFriends, refreshFriendRequests, setTab]);
  const invite = useFriendInvite({ active: ready && onboardingDone, isSignedIn, onAdded: showNewFriend });

  useEffect(() => {
    if (!ready) return;
    return startStreakReminderListener();
  }, [ready]);

  // Once the app is up: start analytics, retry plays that failed to submit and offer to resume an interrupted game.
  useEffect(() => {
    if (!ready || !onboardingDone) return;
    startGameAnalytics();
    void submitQueue
      .flush()
      .then((sent) => {
        if (sent > 0) void refreshWallet();
      })
      .catch(() => {});
    void sessionStore
      .load()
      .then(setResumable)
      .catch(() => {});
  }, [ready, onboardingDone, refreshWallet]);

  const maybeDay0Appointment = useCallback(async () => {
    try {
      const plays = await getGamesCompletedLifetime();
      if (!(await shouldShowDay0Appointment(plays))) return;
      await markDay0AppointmentShown();
      Alert.alert(t("yourStreak"), t("day0Appointment"));
    } catch {
      /* ignore */
    }
  }, [t]);

  const dismissOverlays = useCallback(() => {
    setShowSignIn(false);
    setSignInError("");
    setShowLeaderboard(false);
    setShowNotif(false);
    setShowInterests(false);
    setShowRecap(false);
    setShowStreak(false);
    setPlaying(null);
    setActiveChallenge(null);
    setActiveMatch(null);
    setOnlineSearchGame(null);
    setRestoring(undefined);
    setGameResult(null);
  }, []);

  // After logout / session loss: drop overlays and require sign-in again.
  useEffect(() => {
    if (wasSignedIn.current === null) {
      wasSignedIn.current = isSignedIn;
      return;
    }
    if (wasSignedIn.current && !isSignedIn) {
      dismissOverlays();
      setTab("feed");
      setPromptSave(false);
      void resumeOnboarding("signup");
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn, dismissOverlays, setTab, setPromptSave, resumeOnboarding]);

  // Legacy guest installs finished onboarding without an account — send them to signup.
  useEffect(() => {
    if (ready && onboardingDone && !isSignedIn) {
      void resumeOnboarding("signup");
    }
  }, [ready, isSignedIn, onboardingDone, resumeOnboarding]);

  /**
   * After Google sign-in: returning accounts already have categories on the
   * server — skip create-profile / pick-categories and enter the app. New
   * accounts (or incomplete ones) continue at profile setup.
   * Onboarding completion is device-local, so a reinstall or sign-out would
   * otherwise show the full create-account flow again.
   */
  const continueAfterAuth = useCallback(async () => {
    try {
      const r = await api<{ categories: unknown[] }>("/v1/me/interests");
      if (r.categories?.length) {
        if (!onboardingDone) await completeOnboarding();
        else void refreshFeed();
        return;
      }
    } catch {
      // Missing interests is worse than a redundant prompt.
    }
    if (onboardingDone) await resumeOnboarding("profile");
    else setOnboardingStep("profile");
  }, [onboardingDone, completeOnboarding, refreshFeed, resumeOnboarding, setOnboardingStep]);

  const welcomeGoogle = useCallback(async () => {
    if (welcomeAuthBusy) return;
    setWelcomeAuthBusy(true);
    try {
      await signInWithGoogle();
      await continueAfterAuth();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Google Sign-In failed";
      if (!message.toLowerCase().includes("cancelled")) {
        setSignInError(message);
        setShowSignIn(true);
      }
    } finally {
      setWelcomeAuthBusy(false);
    }
  }, [signInWithGoogle, welcomeAuthBusy, continueAfterAuth]);

  const startGame = useCallback(
    (
      game: FeedGame,
      source: "feed" | "replay" | "next" | "resume" | "challenge" | "online" = "feed",
      challenge?: ActiveChallenge | null,
      match?: ActiveMatch | null,
    ) => {
      setGameResult(null);
      setRestoring(undefined);
      setResumable(null);
      setActiveChallenge(challenge ?? null);
      setActiveMatch(match ?? null);
      setPlaySeed(match?.seed ?? challenge?.seed ?? randomSeed());
      void sessionStore.clear().catch(() => {});
      capture("game_started", {
        game_id: game.key,
        game_type: game.engine ?? game.key,
        source,
        ...gamePlayProps(),
      });
      setPlaying(game);
    },
    [],
  );

  const resumeGame = useCallback((session: GameSession) => {
    const def = session.definition;
    setResumable(null);
    setActiveChallenge(null);
    setActiveMatch(null);
    setPlaySeed(session.seed);
    setRestoring(session);
    capture("game_started", {
      game_id: session.gameKey,
      game_type: def.engine,
      source: "resume",
      ...gamePlayProps(),
    });
    setPlaying({
      type: "mini_game",
      key: session.gameKey,
      title: session.title ?? session.gameKey,
      blurb: "",
      engine: def.engine,
      variation: def.variation,
      config: { ...def },
    });
  }, []);

  const dismissResume = useCallback(() => {
    setResumable(null);
    void sessionStore.clear().catch(() => {});
  }, []);

  const cancelGame = useCallback(() => {
    setPlaying(null);
    setPlaySeed(undefined);
    setActiveChallenge(null);
    setActiveMatch(null);
    setRestoring(undefined);
    setGameSubmitting(false);
  }, []);

  // A failed save never hides the result: the play stays in the persisted queue unless the server rejected it.
  const savePlay = useCallback(
    async (play: CompletedPlay): Promise<SaveOutcome> => {
      const { promptAccountCreation, ...outcome } = await submitAndDescribe(submitQueue, play, (e) =>
        isApiError(e) ? e.userMessage : undefined,
      );
      if (promptAccountCreation) setPromptSave(true);
      return outcome;
    },
    [setPromptSave],
  );

  const finishPlay = useCallback(
    async (
      game: FeedGame,
      play: CompletedPlay,
      challenge?: ActiveChallenge | null,
      match?: ActiveMatch | null,
      opts?: { offerPostPlayHowTo?: boolean },
    ) => {
      let tagged = play;
      if (challenge && !tagged.challengeId) tagged = { ...tagged, challengeId: challenge.id };
      if (match && !tagged.matchId) tagged = { ...tagged, matchId: match.id };
      setGameSubmitting(true);
      const outcome = await savePlay(tagged);
      await noteGameCompletedAnalytics({
        gameId: game.key,
        score: tagged.score,
        durationSeconds: Math.round(tagged.durationMs / 1000),
      });
      // Seed duel meta from the live session so the result screen has PFPs even before poll.
      const seededMatch = outcome.match
        ? {
            ...outcome.match,
            opponentName: outcome.match.opponentName ?? match?.opponent?.displayName,
            opponentAvatarKey: outcome.match.opponentAvatarKey ?? match?.opponent?.avatarKey ?? null,
            myScore: outcome.match.myScore ?? tagged.score,
          }
        : match
          ? {
              id: match.id,
              status: "playing",
              myScore: tagged.score,
              theirScore: null as number | null,
              opponentName: match.opponent?.displayName,
              opponentAvatarKey: match.opponent?.avatarKey ?? null,
            }
          : undefined;
      const seededChallenge = outcome.challenge
        ? {
            ...outcome.challenge,
            opponentName: outcome.challenge.opponentName ?? challenge?.opponent?.displayName,
            opponentAvatarKey:
              outcome.challenge.opponentAvatarKey ?? challenge?.opponent?.avatarKey ?? null,
            myScore: outcome.challenge.myScore ?? tagged.score,
          }
        : challenge
          ? {
              id: challenge.id,
              status: "active",
              myScore: tagged.score,
              theirScore: null as number | null,
              opponentName: challenge.opponent?.displayName,
              opponentAvatarKey: challenge.opponent?.avatarKey ?? null,
            }
          : undefined;

      let teach: PendingPostPlayHowTo | null = null;
      if (opts?.offerPostPlayHowTo && tagged.engine) {
        try {
          const alreadySeen = await hasSeenEngineHowTo(tagged.engine);
          registerEngines();
          const mod = await engineRegistry.load(tagged.engine);
          if (shouldOfferPostPlayHowTo({ hasHowTo: !!mod.HowTo, alreadySeen }) && mod.HowTo) {
            teach = {
              engineId: tagged.engine,
              title: localizeGame(game, language).title,
              HowTo: mod.HowTo,
            };
          }
        } catch {
          teach = null;
        }
      }

      // Result screen before clearing submitting so inline Guess never flashes the feed.
      setPendingPostPlayHowTo(teach);
      setGameResult({
        ...outcome,
        game,
        play: tagged,
        match: seededMatch ?? outcome.match,
        challenge: seededChallenge ?? outcome.challenge,
      });
      setPlaying(null);
      setPlaySeed(undefined);
      setActiveChallenge(null);
      setActiveMatch(null);
      setRestoring(undefined);
      setGameSubmitting(false);
      noteEarn(outcome.balance, outcome.coinsEarned ?? 0, "game", {
        gameId: game.key,
        playId: tagged.sessionId,
      });
    },
    [savePlay, noteEarn, language],
  );

  const submitGamePlay = useCallback(
    async (play: CompletedPlay) => {
      if (!playing) return;
      await finishPlay(playing, play, activeChallenge, activeMatch);
    },
    [playing, activeChallenge, activeMatch, finishPlay],
  );

  const submitInlineGuess = useCallback(
    async (game: FeedGame, play: CompletedPlay) => {
      await finishPlay(game, play, null, null, { offerPostPlayHowTo: true });
    },
    [finishPlay],
  );

  const dismissPostPlayHowTo = useCallback(() => {
    const engineId = pendingPostPlayHowTo?.engineId;
    setPendingPostPlayHowTo(null);
    if (engineId) void markEngineHowToSeen(engineId);
  }, [pendingPostPlayHowTo?.engineId]);

  const retrySave = useCallback(async () => {
    if (!gameResult || retryingSave) return;
    const { sessionId } = gameResult.play;
    setRetryingSave(true);
    const outcome = await savePlay(gameResult.play);
    setGameResult((r) => {
      if (!r || r.play.sessionId !== sessionId) return r;
      return {
        ...r,
        ...outcome,
        // Keep the first successful "+N coins" badge if a replay returns 0.
        coinsEarned: outcome.coinsEarned || r.coinsEarned,
      };
    });
    noteEarn(outcome.balance, outcome.coinsEarned ?? 0, "game", {
      gameId: gameResult.game.key,
      playId: sessionId,
    });
    setRetryingSave(false);
  }, [gameResult, retryingSave, savePlay, noteEarn]);

  const goBackOnboarding = useCallback(() => {
    if (onboardingStep === "ready") return;
    if (onboardingStep === "interests") setOnboardingStep("profile");
    else if (onboardingStep === "profile") setOnboardingStep("signup");
    else if (onboardingStep === "signup") {
      setIntroPage(1);
      setOnboardingStep("intro");
    } else if (onboardingStep === "intro") {
      if (introPage > 0) setIntroPage(introPage - 1);
      else setOnboardingStep("language");
    }
  }, [onboardingStep, setOnboardingStep, introPage]);

  const finishOnboarding = useCallback(async () => {
    if (finishingOnboarding) return;
    setFinishingOnboarding(true);
    try {
      await completeOnboarding();
    } finally {
      setFinishingOnboarding(false);
    }
  }, [completeOnboarding, finishingOnboarding]);

  useEffect(() => {
    if (!onboardingDone && onboardingStep === "ready") void finishOnboarding();
  }, [onboardingDone, onboardingStep, finishOnboarding]);

  // Android system back — unwind overlays / onboarding; exit only from root.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showSignIn) {
        setSignInError("");
        setShowSignIn(false);
        return true;
      }
      if (!onboardingDone) {
        if (onboardingStep === "language") return false;
        goBackOnboarding();
        return true;
      }
      if (playing) {
        if (gameSubmitting) return true;
        // GameHost owns back while a game is on screen (pause menu / exit).
        return false;
      }
      if (gameResult && pendingPostPlayHowTo) {
        dismissPostPlayHowTo();
        return true;
      }
      if (gameResult) {
        setPendingPostPlayHowTo(null);
        setGameResult(null);
        return true;
      }
      if (showLeaderboard) {
        setShowLeaderboard(false);
        return true;
      }
      if (showNotif) {
        setShowNotif(false);
        return true;
      }
      if (showInterests) {
        setShowInterests(false);
        return true;
      }
      if (showRecap) {
        setShowRecap(false);
        return true;
      }
      if (showStreak) {
        setShowStreak(false);
        return true;
      }
      // Root tab screen — allow default (minimize / exit).
      return false;
    });
    return () => sub.remove();
  }, [
    showSignIn,
    onboardingDone,
    onboardingStep,
    goBackOnboarding,
    playing,
    gameSubmitting,
    gameResult,
    pendingPostPlayHowTo,
    dismissPostPlayHowTo,
    showLeaderboard,
    showNotif,
    showInterests,
    showRecap,
    showStreak,
  ]);

  useEffect(() => {
    if (!ready) {
      trackScreen("boot");
      return;
    }
    if (showSignIn) {
      trackScreen("sign_in");
      return;
    }
    if (!onboardingDone) {
      markOnboardingStart();
      trackScreen(`onboarding_${onboardingStep}`);
      return;
    }
    if (playing) {
      trackScreen("game");
      return;
    }
    if (gameResult) {
      trackScreen("game_result");
      return;
    }
    if (showLeaderboard) {
      trackScreen("leaderboard");
      return;
    }
    if (showNotif) {
      trackScreen("notifications");
      return;
    }
    if (showInterests) {
      trackScreen("edit_interests");
      return;
    }
    if (showRecap) {
      trackScreen("weekly_recap");
      return;
    }
    if (showStreak) {
      trackScreen("streak");
      return;
    }
    if (showWallet) {
      trackScreen("wallet");
      return;
    }
    trackScreen(tab);
  }, [
    ready,
    showSignIn,
    onboardingDone,
    onboardingStep,
    playing,
    gameResult,
    showLeaderboard,
    showNotif,
    showInterests,
    showRecap,
    showStreak,
    showWallet,
    tab,
  ]);

  if (!ready) {
    return (
      <BootLoading
        onRetry={() => {
          void (async () => {
            await clearLocalSupabaseSession();
            await retryBoot();
          })();
        }}
      />
    );
  }

  // Sign-in overlay can appear during onboarding or from the main app.
  if (showSignIn) {
    return (
      <SignInScreen
        initialError={signInError}
        onClose={() => {
          setSignInError("");
          setShowSignIn(false);
        }}
        onSuccess={() => {
          setPromptSave(false);
          setSignInError("");
          void continueAfterAuth();
        }}
      />
    );
  }

  // Onboarding before feed boot errors — first-time users must not be trapped.
  if (!onboardingDone) {
    let screen: ReactNode;
    if (onboardingStep === "language") {
      screen = (
        <LanguageScreen
          onNext={() => {
            setIntroPage(0);
            setOnboardingStep("intro");
          }}
        />
      );
    } else if (onboardingStep === "intro") {
      screen = (
        <LazyIntroSlides
          page={introPage}
          onPageChange={setIntroPage}
          onBack={goBackOnboarding}
          onNext={() => setOnboardingStep("signup")}
        />
      );
    } else if (onboardingStep === "signup") {
      screen = (
        <WelcomeScreen
          onBack={goBackOnboarding}
          googleAvailable={googleAvailable}
          onGoogleSignIn={() => void welcomeGoogle()}
          busy={welcomeAuthBusy}
          signedInAs={isSignedIn ? (user?.email ?? t("yourAccount")) : null}
          onContinueSignedIn={() => void continueAfterAuth()}
        />
      );
    } else if (onboardingStep === "profile") {
      screen = <ProfileSetupScreen onBack={goBackOnboarding} onNext={() => setOnboardingStep("interests")} />;
    } else if (onboardingStep === "interests") {
      screen = (
        <InterestsScreen
          onBack={goBackOnboarding}
          onDone={() => void finishOnboarding()}
        />
      );
    } else {
      screen = null;
    }
    return (
      <Animated.View key={onboardingStep} entering={FadeIn.duration(220)} style={styles.root}>
        {screen}
      </Animated.View>
    );
  }

  if (bootError) {
    return (
      <ErrorState
        title={t("couldntReachFeed")}
        message={bootError}
        onRetry={() => void retryBoot()}
      />
    );
  }

  if (playing) {
    const rival = activeMatch?.opponent ?? activeChallenge?.opponent;
    return (
      <View style={{ flex: 1 }}>
        <GameHost
          card={playing}
          restore={restoring}
          seed={playSeed}
          sharedSeed={!!activeChallenge || !!activeMatch}
          duel={
            rival
              ? {
                  you: {
                    displayName: me?.displayName ?? "You",
                    avatarKey: me?.avatarKey ?? null,
                  },
                  opponent: rival,
                }
              : null
          }
          onComplete={(play) => void submitGamePlay(play)}
          onExit={cancelGame}
        />
        {gameSubmitting ? (
          <View style={styles.submitOverlay}>
            <ScreenLoading label={t("savingScore")} style={{ flex: 0, backgroundColor: "transparent" }} />
          </View>
        ) : null}
      </View>
    );
  }

  if (gameSubmitting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <ScreenLoading label={t("savingScore")} />
      </View>
    );
  }

  if (gameResult && pendingPostPlayHowTo) {
    const HowTo = pendingPostPlayHowTo.HowTo;
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <HowTo title={pendingPostPlayHowTo.title} onDone={dismissPostPlayHowTo} />
      </View>
    );
  }

  if (gameResult) {
    const upNext = nextGame(
      items.filter((i): i is FeedGame => i.type === "mini_game"),
      gameResult.game.key,
    );
    return (
      <View style={{ flex: 1 }}>
        <PostGameResultScreen
          gameKey={gameResult.game.key}
          gameTitle={localizeGame(gameResult.game, language).title}
          score={gameResult.score}
          percentile={gameResult.percentile}
          correct={gameResult.play.correct}
          attempts={gameResult.play.attempts}
          rounds={gameResult.play.rounds}
          scoreBreakdown={gameResult.play.breakdown}
          coinsEarned={gameResult.coinsEarned}
          saveState={gameResult.saveState}
          saveMessage={gameResult.saveMessage}
          playId={gameResult.playId}
          playSeed={gameResult.play.seed}
          challengeSummary={gameResult.challenge}
          matchSummary={gameResult.match}
          onMatchUpdated={(match) => {
            setGameResult((r) => (r ? { ...r, match } : r));
          }}
          onRetrySave={() => void retrySave()}
          retryingSave={retryingSave}
          onPlayAgain={
            gameResult.match || gameResult.challenge
              ? undefined
              : () => startGame(gameResult.game, "replay")
          }
          onPlayOnline={
            gameResult.match || gameResult.challenge
              ? undefined
              : () => setOnlineSearchGame(gameResult.game)
          }
          onRematch={
            gameResult.match
              ? async () => {
                  const { rematch } = await import("./lib/matchmaking");
                  const m = await rematch(gameResult.match!.id);
                  startGame(gameResult.game, "online", null, {
                    id: m.id,
                    seed: m.seed,
                    opponent: rivalFromMatch(m),
                  });
                }
              : undefined
          }
          onNextGame={
            gameResult.match || gameResult.challenge
              ? undefined
              : upNext
                ? () => startGame(upNext, "next")
                : undefined
          }
          onBackToFeed={() => {
            setPendingPostPlayHowTo(null);
            setGameResult(null);
            void refreshWallet();
            void maybeDay0Appointment();
          }}
          onSignIn={() => setShowSignIn(true)}
          enableShare
        />
        <LazyMatchmakingSheet
          visible={!!onlineSearchGame}
          gameKey={onlineSearchGame?.key ?? gameResult.game.key}
          gameTitle={localizeGame(onlineSearchGame ?? gameResult.game, language).title}
          signedIn={isSignedIn}
          onNeedSignIn={() => setShowSignIn(true)}
          onClose={() => setOnlineSearchGame(null)}
          onMatched={(match) => {
            const game = onlineSearchGame ?? gameResult.game;
            setOnlineSearchGame(null);
            setGameResult(null);
            startGame(game, "online", null, {
              id: match.id,
              seed: match.seed,
              opponent: rivalFromMatch(match),
            });
          }}
        />
      </View>
    );
  }

  if (showLeaderboard) {
    return (
      <LeaderboardScreen
        onBack={() => setShowLeaderboard(false)}
        onSignIn={() => {
          setShowLeaderboard(false);
          setShowSignIn(true);
        }}
      />
    );
  }

  if (showNotif) {
    return (
      <NotificationsScreen
        onBack={() => setShowNotif(false)}
        onSignIn={() => {
          setShowNotif(false);
          setShowSignIn(true);
        }}
      />
    );
  }

  if (showInterests) {
    return (
      <InterestsScreen
        mode="settings"
        onBack={() => setShowInterests(false)}
        onDone={() => {
          setShowInterests(false);
          void refreshFeed();
        }}
      />
    );
  }

  if (showRecap) {
    return (
      <WeeklyRecapScreen
        onBack={() => setShowRecap(false)}
        onSignIn={() => {
          setShowRecap(false);
          setShowSignIn(true);
        }}
      />
    );
  }

  if (showStreak) {
    return <StreakScreen onBack={() => setShowStreak(false)} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <View style={[styles.tabPane, tab !== "feed" && styles.hidden]}>
          <FeedScreen
            feedTopNonce={feedTopNonce}
            onPlayGame={startGame}
            onChallengeGame={(game, challenge) => startGame(game, "challenge", challenge)}
            onGuessComplete={(game, play) => void submitInlineGuess(game, play)}
            onOpenProfile={() => setTab("vault")}
            onOpenStreak={() => setShowStreak(true)}
            onOpenWallet={() => setShowWallet(true)}
            onSignIn={isSupabaseConfigured() ? () => setShowSignIn(true) : undefined}
          />
        </View>
        <View style={[styles.tabPane, tab !== "compete" && styles.hidden]}>
          <BattleFlow
            signedIn={isSignedIn}
            onNeedSignIn={() => setShowSignIn(true)}
            onProfile={() => setTab("vault")}
            onAddFriends={() => setTab("friends")}
            initialFriendId={battleFriendId}
            onConsumedInitialFriend={() => setBattleFriendId(null)}
            onStartMatch={(game, match) => {
              startGame(game, "online", null, match);
            }}
            onStartChallenge={(game, challenge) => {
              startGame(game, "challenge", challenge);
            }}
          />
        </View>
        <View style={[styles.tabPane, tab !== "friends" && styles.hidden]}>
          <FriendsScreen
            onSignIn={() => setShowSignIn(true)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onChallengeFriend={(friendId) => {
              setBattleFriendId(friendId);
              setTab("compete");
            }}
            onPlayChallenge={(game, challenge) => {
              startGame(game, "challenge", challenge);
            }}
            onPlayOnlineMatch={(game, match) => {
              startGame(game, "online", null, match);
            }}
          />
        </View>
        <View style={[styles.tabPane, tab !== "vault" && styles.hidden]}>
          <SettingsScreen
            onOpenNotifications={() => setShowNotif(true)}
            onOpenInterests={() => setShowInterests(true)}
            onOpenRecap={() => setShowRecap(true)}
            onSignIn={() => setShowSignIn(true)}
          />
        </View>
      </View>

      {resumable ? (
        <View style={[styles.banner, styles.resumeBanner]}>
          <Pressable style={{ flex: 1 }} onPress={() => resumeGame(resumable)} accessibilityRole="button">
            <Text style={[type.bodySm, { color: colors.paper }]}>
              Resume {resumable.title ?? "your game"}? Score {resumable.score}
            </Text>
          </Pressable>
          <CloseButton onPress={dismissResume} />
        </View>
      ) : null}
      {invite.notice ? (
        <View
          style={[
            styles.banner,
            styles.inviteBanner,
            { borderColor: invite.notice.kind === "error" ? colors.pink : colors.lime },
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            disabled={invite.notice.kind !== "signin"}
            onPress={() => setShowSignIn(true)}
            accessibilityRole={invite.notice.kind === "signin" ? "button" : "alert"}
          >
            <Text style={[type.bodySm, { color: colors.paper }]}>{invite.notice.text}</Text>
          </Pressable>
          <CloseButton onPress={invite.dismiss} />
        </View>
      ) : null}
      {promptSave ? (
        <Pressable style={styles.banner} onPress={() => setShowSignIn(true)}>
          <Text style={[type.bodySm, { color: colors.paper }]}>
            Save your progress — tap to sign in.
          </Text>
        </Pressable>
      ) : null}

      <BottomNav
        active={tab}
        onChange={(next: TabKey) => {
          if (next === "feed" && tab === "feed") {
            setFeedTopNonce((n) => n + 1);
            return;
          }
          setTab(next);
        }}
      />
      <WalletSheet
        visible={showWallet}
        onClose={() => setShowWallet(false)}
        onSignIn={
          isSupabaseConfigured()
            ? () => {
                setShowWallet(false);
                setShowSignIn(true);
              }
            : undefined
        }
      />
    </View>
  );
}

function GlobalCoinCredit() {
  const { coinCredit } = useApp();
  return <CoinToast credit={coinCredit} />;
}

export default function AppRoot() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <MainShell />
        <GlobalCoinCredit />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  body: { flex: 1 },
  tabPane: { flex: 1 },
  hidden: { display: "none" },
  center: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  centerPad: { flex: 1, backgroundColor: colors.ink, padding: 24, justifyContent: "center", gap: spacing.md },
  banner: {
    backgroundColor: colors.cardAlt,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: 12,
    borderRadius: 12,
    zIndex: 100,
  },
  resumeBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.lime },
  inviteBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1 },
  submitOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(21,14,43,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
});
