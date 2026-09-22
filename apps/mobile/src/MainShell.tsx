import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedGame, isApiError } from "./api";
import { BottomNav, TabKey } from "./components/BottomNav";
import { ErrorState } from "./components/ErrorState";
import { PrimaryButton } from "./components/PrimaryButton";
import { useApp } from "./context/AppContext";
import { GameEngine, submitPlay } from "./games";
import { FeedScreen } from "./screens/feed/FeedScreen";
import { PostGameResultScreen } from "./screens/feed/PostGameResultScreen";
import { FriendsScreen } from "./screens/friends/FriendsScreen";
import { LeaderboardScreen } from "./screens/friends/LeaderboardScreen";
import { LiveNowScreen } from "./screens/live/LiveNowScreen";
import { GetStartedScreen } from "./screens/onboarding/GetStartedScreen";
import { InterestsScreen } from "./screens/onboarding/InterestsScreen";
import { LanguageScreen } from "./screens/onboarding/LanguageScreen";
import { WelcomeScreen } from "./screens/onboarding/WelcomeScreen";
import { NotificationsScreen } from "./screens/profile/NotificationsScreen";
import { SettingsScreen } from "./screens/profile/SettingsScreen";
import { WeeklyRecapScreen } from "./screens/profile/WeeklyRecapScreen";
import { SignInScreen } from "./screens/auth/SignInScreen";
import { useAuth } from "./context/AuthContext";
import { clearLocalSupabaseSession, isSupabaseConfigured } from "./lib/supabase";
import { colors, spacing } from "./theme/colors";
import { type } from "./theme/typography";

function newIdempotencyKey(gameKey: string) {
  return `${gameKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function BootLoading({ onRetry }: { onRetry: () => void }) {
  const [showRetry, setShowRetry] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowRetry(true), 8_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.center}>
      <Text style={[type.logo, { color: colors.pink, fontSize: 36 }]}>PLAY</Text>
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
  } = useApp();
  const { googleAvailable, signInWithGoogle, isSignedIn } = useAuth();
  const [playing, setPlaying] = useState<FeedGame | null>(null);
  const [gameResult, setGameResult] = useState<{ title: string; score: number; percentile: number } | null>(
    null,
  );
  const [showNotif, setShowNotif] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [gameSubmitting, setGameSubmitting] = useState(false);
  const [gameSubmitError, setGameSubmitError] = useState("");
  const [lastPlay, setLastPlay] = useState<{ score: number; durationMs: number } | null>(null);
  const [welcomeAuthBusy, setWelcomeAuthBusy] = useState(false);
  const [signInError, setSignInError] = useState("");
  const playIdempotencyKey = useRef("");
  const wasSignedIn = useRef<boolean | null>(null);

  const dismissOverlays = useCallback(() => {
    setShowSignIn(false);
    setSignInError("");
    setShowLeaderboard(false);
    setShowNotif(false);
    setShowRecap(false);
    setPlaying(null);
    setGameResult(null);
    setGameSubmitError("");
    setLastPlay(null);
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
      setOnboardingStep("get_started");
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
    playIdempotencyKey.current = newIdempotencyKey(game.key);
    setGameSubmitError("");
    setLastPlay(null);
    setPlaying(game);
  }, []);

  const cancelGame = useCallback(() => {
    setPlaying(null);
    setGameSubmitError("");
    setLastPlay(null);
    setGameSubmitting(false);
  }, []);

  const startFirstGameFromFeed = useCallback(() => {
    const game = items.find((i): i is FeedGame => i.type === "mini_game");
    if (game) startGame(game);
    else {
      void completeOnboarding();
    }
  }, [items, startGame, completeOnboarding]);

  const submitGamePlay = useCallback(
    async (score: number, durationMs: number) => {
      if (!playing) return;
      setLastPlay({ score, durationMs });
      setGameSubmitting(true);
      setGameSubmitError("");
      try {
        const res = await submitPlay(playing.key, score, durationMs, playIdempotencyKey.current);
        const title = playing.title;
        setPlaying(null);
        setLastPlay(null);
        setGameResult({ title, score: res.score, percentile: res.percentile });
        if (res.promptAccountCreation) setPromptSave(true);
      } catch (e) {
        const message = isApiError(e) ? e.userMessage : e instanceof Error ? e.message : "Could not save score";
        setGameSubmitError(message);
      } finally {
        setGameSubmitting(false);
      }
    },
    [playing, setPromptSave],
  );

  const goBackOnboarding = useCallback(() => {
    if (onboardingStep === "interests") setOnboardingStep("language");
    else if (onboardingStep === "language") setOnboardingStep("get_started");
    else if (onboardingStep === "get_started") setOnboardingStep("welcome");
  }, [onboardingStep, setOnboardingStep]);

  // Android system back — unwind overlays / onboarding; exit only from root.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showSignIn) {
        setSignInError("");
        setShowSignIn(false);
        return true;
      }
      if (!onboardingDone) {
        if (onboardingStep === "welcome") return false;
        goBackOnboarding();
        return true;
      }
      if (playing) {
        if (gameSubmitting) return true;
        cancelGame();
        return true;
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
    cancelGame,
    gameResult,
    showLeaderboard,
    showNotif,
    showRecap,
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
          if (!onboardingDone && onboardingStep === "welcome") {
            setOnboardingStep("get_started");
          }
        }}
      />
    );
  }

  // Onboarding before feed boot errors — first-time users must not be trapped.
  if (!onboardingDone) {
    if (onboardingStep === "welcome") {
      return (
        <WelcomeScreen
          onNext={() => setOnboardingStep("get_started")}
          googleAvailable={googleAvailable}
          onGoogleSignIn={() => void welcomeGoogle()}
          onEmailSignIn={isSupabaseConfigured() ? openSignIn : undefined}
        />
      );
    }
    if (onboardingStep === "get_started")
      return (
        <GetStartedScreen
          onBack={goBackOnboarding}
          onContinue={() => setOnboardingStep("language")}
          onPlayTrivia={() => setOnboardingStep("language")}
          onPlayGame={() => {
            void completeOnboarding().then(() => startFirstGameFromFeed());
          }}
        />
      );
    if (onboardingStep === "language")
      return (
        <LanguageScreen
          onBack={goBackOnboarding}
          onNext={() => setOnboardingStep("interests")}
          onSkip={() => setOnboardingStep("interests")}
        />
      );
    return (
      <InterestsScreen
        onBack={goBackOnboarding}
        onDone={async () => {
          await completeOnboarding();
        }}
      />
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
    if (gameSubmitError && lastPlay) {
      return (
        <View style={styles.centerPad}>
          <ErrorState
            title="Score not saved"
            message={gameSubmitError}
            onRetry={() => void submitGamePlay(lastPlay.score, lastPlay.durationMs)}
            retryLabel="Retry"
          />
          <PrimaryButton
            label="Back to feed"
            onPress={() => {
              cancelGame();
            }}
          />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <GameEngine
          gameKey={playing.key}
          title={playing.title}
          blurb={playing.blurb}
          config={playing.config}
          onDone={(score, durationMs) => void submitGamePlay(score, durationMs)}
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
    return (
      <PostGameResultScreen
        gameTitle={gameResult.title}
        score={gameResult.score}
        percentile={gameResult.percentile}
        onContinue={() => setGameResult(null)}
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

  return (
    <View style={styles.root}>
      {promptSave ? (
        <Pressable style={styles.banner} onPress={() => setShowSignIn(true)}>
          <Text style={[type.bodySm, { color: colors.paper }]}>
            Save your progress — tap to sign in.
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.body}>
        <View style={[styles.tabPane, tab !== "feed" && styles.hidden]}>
          <FeedScreen onPlayGame={startGame} onOpenProfile={() => setTab("vault")} />
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
    marginTop: spacing.sm,
    padding: 12,
    borderRadius: 12,
    zIndex: 100,
  },
  submitOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(21,14,43,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
});
