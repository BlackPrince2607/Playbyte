import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedGame, isApiError } from "./api";
import { BottomNav, TabKey } from "./components/BottomNav";
import { ErrorState } from "./components/ErrorState";
import { MajaLogo } from "./components/MajaLogo";
import { PrimaryButton } from "./components/PrimaryButton";
import { useApp } from "./context/AppContext";
import { nextGame } from "./game/discovery";
import { startGameAnalytics } from "./game/platform/analytics";
import { sessionStore, submitQueue } from "./game/platform/services";
import { savePlay as submitAndDescribe, type SaveOutcome } from "./game/session/submitQueue";
import type { CompletedPlay, GameSession } from "./game/session/types";
import { GameHost } from "./game/ui/GameHost";
import { FeedScreen } from "./screens/feed/FeedScreen";
import { PostGameResultScreen } from "./screens/feed/PostGameResultScreen";
import { StreakScreen } from "./screens/feed/StreakScreen";
import { FriendsScreen } from "./screens/friends/FriendsScreen";
import { LeaderboardScreen } from "./screens/friends/LeaderboardScreen";
import { LiveNowScreen } from "./screens/live/LiveNowScreen";
import { InterestsScreen } from "./screens/onboarding/InterestsScreen";
import { IntroSlidesScreen } from "./screens/onboarding/IntroSlidesScreen";
import { LanguageScreen } from "./screens/onboarding/LanguageScreen";
import { ProfileSetupScreen } from "./screens/onboarding/ProfileSetupScreen";
import { ReadyScreen } from "./screens/onboarding/ReadyScreen";
import { WelcomeScreen } from "./screens/onboarding/WelcomeScreen";
import { NotificationsScreen } from "./screens/profile/NotificationsScreen";
import { SettingsScreen } from "./screens/profile/SettingsScreen";
import { WeeklyRecapScreen } from "./screens/profile/WeeklyRecapScreen";
import { SignInScreen } from "./screens/auth/SignInScreen";
import { useAuth } from "./context/AuthContext";
import { clearLocalSupabaseSession, isSupabaseConfigured } from "./lib/supabase";
import { useFriendInvite } from "./lib/useFriendInvite";
import { colors, spacing } from "./theme/colors";
import { type } from "./theme/typography";

type GameResult = SaveOutcome & { game: FeedGame; play: CompletedPlay };

function BootLoading({ onRetry }: { onRetry: () => void }) {
  const [showRetry, setShowRetry] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowRetry(true), 8_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.center}>
      <MajaLogo size="lg" />
      <ActivityIndicator color={colors.lime} style={{ marginTop: 16 }} />
      {showRetry ? (
        <View style={{ marginTop: 24, paddingHorizontal: 32, alignItems: "center", gap: 12 }}>
          <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
            Still starting up. You can retry — this clears a stuck sign-in session if needed.
          </Text>
          <PrimaryButton label="Retry" onPress={onRetry} />
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
    refreshFeed,
    retryBoot,
    items,
    streak,
    refreshFriends,
    refreshFriendRequests,
  } = useApp();
  const { googleAvailable, signInWithGoogle, isSignedIn, user } = useAuth();
  const [playing, setPlaying] = useState<FeedGame | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [gameSubmitting, setGameSubmitting] = useState(false);
  const [resumable, setResumable] = useState<GameSession | null>(null);
  const [restoring, setRestoring] = useState<GameSession | undefined>(undefined);
  const [welcomeAuthBusy, setWelcomeAuthBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [introPage, setIntroPage] = useState(0);
  const [pickedInterests, setPickedInterests] = useState<string[]>([]);
  const [finishingOnboarding, setFinishingOnboarding] = useState(false);
  const wasSignedIn = useRef<boolean | null>(null);

  const showNewFriend = useCallback(() => {
    void refreshFriends(true);
    void refreshFriendRequests(true);
    setTab("friends");
  }, [refreshFriends, refreshFriendRequests, setTab]);
  const invite = useFriendInvite({ active: ready && onboardingDone, isSignedIn, onAdded: showNewFriend });

  // Once the app is up: start analytics, retry plays that failed to submit and offer to resume an interrupted game.
  useEffect(() => {
    if (!ready || !onboardingDone) return;
    startGameAnalytics();
    void submitQueue.flush().catch(() => {});
    void sessionStore
      .load()
      .then(setResumable)
      .catch(() => {});
  }, [ready, onboardingDone]);

  const dismissOverlays = useCallback(() => {
    setShowSignIn(false);
    setSignInError("");
    setShowLeaderboard(false);
    setShowNotif(false);
    setShowRecap(false);
    setShowStreak(false);
    setPlaying(null);
    setRestoring(undefined);
    setGameResult(null);
  }, []);

  // After logout: drop auth-gated overlays and land on Feed as guest.
  useEffect(() => {
    if (wasSignedIn.current === null) {
      wasSignedIn.current = isSignedIn;
      return;
    }
    if (wasSignedIn.current && !isSignedIn) {
      dismissOverlays();
      setTab("feed");
      setPromptSave(false);
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn, dismissOverlays, setTab, setPromptSave]);

  const openSignIn = useCallback(() => {
    setSignInError("");
    setShowSignIn(true);
  }, []);

  const welcomeGoogle = useCallback(async () => {
    if (welcomeAuthBusy) return;
    setWelcomeAuthBusy(true);
    try {
      await signInWithGoogle();
      setOnboardingStep("profile");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Google Sign-In failed";
      if (!message.toLowerCase().includes("cancelled")) {
        setSignInError(message);
        setShowSignIn(true);
      }
    } finally {
      setWelcomeAuthBusy(false);
    }
  }, [signInWithGoogle, welcomeAuthBusy, setOnboardingStep]);

  const startGame = useCallback((game: FeedGame) => {
    setGameResult(null);
    setRestoring(undefined);
    setResumable(null);
    void sessionStore.clear().catch(() => {});
    setPlaying(game);
  }, []);

  const resumeGame = useCallback((session: GameSession) => {
    const def = session.definition;
    setResumable(null);
    setRestoring(session);
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

  const submitGamePlay = useCallback(
    async (play: CompletedPlay) => {
      if (!playing) return;
      const game = playing;
      setGameSubmitting(true);
      const outcome = await savePlay(play);
      setPlaying(null);
      setRestoring(undefined);
      setGameSubmitting(false);
      setGameResult({ ...outcome, game, play });
    },
    [playing, savePlay],
  );

  const retrySave = useCallback(async () => {
    if (!gameResult || retryingSave) return;
    const { sessionId } = gameResult.play;
    setRetryingSave(true);
    const outcome = await savePlay(gameResult.play);
    setGameResult((r) => (r && r.play.sessionId === sessionId ? { ...r, ...outcome } : r));
    setRetryingSave(false);
  }, [gameResult, retryingSave, savePlay]);

  const goBackOnboarding = useCallback(() => {
    if (onboardingStep === "ready") setOnboardingStep("interests");
    else if (onboardingStep === "interests") setOnboardingStep("profile");
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
      if (gameResult) {
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
    showLeaderboard,
    showNotif,
    showRecap,
    showStreak,
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
          void refreshFeed();
          if (!onboardingDone && onboardingStep === "signup") {
            setOnboardingStep("profile");
          }
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
        <IntroSlidesScreen
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
          onGuest={() => setOnboardingStep("profile")}
          googleAvailable={googleAvailable}
          onGoogleSignIn={() => void welcomeGoogle()}
          onEmailSignIn={isSupabaseConfigured() ? openSignIn : undefined}
          busy={welcomeAuthBusy}
          signedInAs={isSignedIn ? (user?.email ?? "your account") : null}
          onContinueSignedIn={() => setOnboardingStep("profile")}
        />
      );
    } else if (onboardingStep === "profile") {
      screen = <ProfileSetupScreen onBack={goBackOnboarding} onNext={() => setOnboardingStep("interests")} />;
    } else if (onboardingStep === "interests") {
      screen = (
        <InterestsScreen
          onBack={goBackOnboarding}
          onDone={(picked) => {
            setPickedInterests(picked.map((c) => c.name));
            setOnboardingStep("ready");
          }}
        />
      );
    } else {
      screen = (
        <ReadyScreen
          interests={pickedInterests}
          onBack={goBackOnboarding}
          onDone={() => void finishOnboarding()}
          busy={finishingOnboarding}
        />
      );
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
        title="Couldn't reach the feed"
        message={bootError}
        onRetry={() => void retryBoot()}
      />
    );
  }

  if (playing) {
    return (
      <View style={{ flex: 1 }}>
        <GameHost
          card={playing}
          restore={restoring}
          onComplete={(play) => void submitGamePlay(play)}
          onExit={cancelGame}
        />
        {gameSubmitting ? (
          <View style={styles.submitOverlay} accessibilityLabel="Saving score">
            <ActivityIndicator color={colors.lime} size="large" />
            <Text style={[type.bodySm, { color: colors.lilac, marginTop: 12 }]}>Saving score…</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (gameResult) {
    const upNext = nextGame(
      items.filter((i): i is FeedGame => i.type === "mini_game"),
      gameResult.game.key,
    );
    return (
      <PostGameResultScreen
        gameTitle={gameResult.game.title}
        score={gameResult.score}
        percentile={gameResult.percentile}
        correct={gameResult.play.correct}
        attempts={gameResult.play.attempts}
        rounds={gameResult.play.rounds}
        scoreBreakdown={gameResult.play.breakdown}
        saveState={gameResult.saveState}
        saveMessage={gameResult.saveMessage}
        onRetrySave={() => void retrySave()}
        retryingSave={retryingSave}
        onPlayAgain={() => startGame(gameResult.game)}
        onNextGame={upNext ? () => startGame(upNext) : undefined}
        onBackToFeed={() => setGameResult(null)}
        enableShare
      />
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
    return <StreakScreen streak={streak} onBack={() => setShowStreak(false)} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <View style={[styles.tabPane, tab !== "feed" && styles.hidden]}>
          <FeedScreen
            onPlayGame={startGame}
            onOpenProfile={() => setTab("vault")}
            onOpenStreak={() => setShowStreak(true)}
            onSignIn={isSupabaseConfigured() ? () => setShowSignIn(true) : undefined}
          />
        </View>
        <View style={[styles.tabPane, tab !== "compete" && styles.hidden]}>
          <LiveNowScreen onProfile={() => setTab("vault")} />
        </View>
        <View style={[styles.tabPane, tab !== "friends" && styles.hidden]}>
          <FriendsScreen
            onSignIn={() => setShowSignIn(true)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
          />
        </View>
        <View style={[styles.tabPane, tab !== "vault" && styles.hidden]}>
          <SettingsScreen
            onOpenNotifications={() => setShowNotif(true)}
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
          <Pressable onPress={dismissResume} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
            <Text style={[type.bodySm, { color: colors.lilac }]}>✕</Text>
          </Pressable>
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
          <Pressable onPress={invite.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
            <Text style={[type.bodySm, { color: colors.lilac }]}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      {promptSave ? (
        <Pressable style={styles.banner} onPress={() => setShowSignIn(true)}>
          <Text style={[type.bodySm, { color: colors.paper }]}>
            Save your progress — tap to sign in.
          </Text>
        </Pressable>
      ) : null}

      <BottomNav active={tab} onChange={(t: TabKey) => setTab(t)} />
    </View>
  );
}

export default function AppRoot() {
  return (
    <SafeAreaProvider>
      <MainShell />
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
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(21,14,43,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
});
