import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
import { LiveNowScreen } from "./screens/live/LiveNowScreen";
import { InterestsScreen } from "./screens/onboarding/InterestsScreen";
import { LanguageScreen } from "./screens/onboarding/LanguageScreen";
import { WelcomeScreen } from "./screens/onboarding/WelcomeScreen";
import { NotificationsScreen } from "./screens/profile/NotificationsScreen";
import { SettingsScreen } from "./screens/profile/SettingsScreen";
import { WeeklyRecapScreen } from "./screens/profile/WeeklyRecapScreen";
import { SignInScreen } from "./screens/auth/SignInScreen";
import { colors, spacing } from "./theme/colors";
import { type } from "./theme/typography";

type OnboardStep = "welcome" | "language" | "interests";

function newIdempotencyKey(gameKey: string) {
  return `${gameKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function MainShell() {
  const {
    ready,
    bootError,
    onboardingDone,
    tab,
    setTab,
    promptSave,
    setPromptSave,
    completeOnboarding,
    refreshFeed,
    retryBoot,
  } = useApp();
  const [step, setStep] = useState<OnboardStep>("welcome");
  const [playing, setPlaying] = useState<FeedGame | null>(null);
  const [gameResult, setGameResult] = useState<{ title: string; score: number; percentile: number } | null>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [gameSubmitting, setGameSubmitting] = useState(false);
  const [gameSubmitError, setGameSubmitError] = useState("");
  const [lastPlay, setLastPlay] = useState<{ score: number; durationMs: number } | null>(null);
  const playIdempotencyKey = useRef("");

  const startGame = useCallback((game: FeedGame) => {
    playIdempotencyKey.current = newIdempotencyKey(game.key);
    setGameSubmitError("");
    setLastPlay(null);
    setPlaying(game);
  }, []);

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

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={[type.logo, { color: colors.pink, fontSize: 36 }]}>PLAY</Text>
        <ActivityIndicator color={colors.lime} style={{ marginTop: 16 }} />
      </View>
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

  if (!onboardingDone) {
    if (step === "welcome") return <WelcomeScreen onNext={() => setStep("language")} />;
    if (step === "language")
      return (
        <LanguageScreen onNext={() => setStep("interests")} onSkip={() => setStep("interests")} />
      );
    return (
      <InterestsScreen
        onDone={async () => {
          await completeOnboarding();
        }}
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
              setPlaying(null);
              setGameSubmitError("");
              setLastPlay(null);
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
      />
    );
  }

  if (showSignIn) {
    return (
      <SignInScreen
        onClose={() => setShowSignIn(false)}
        onSuccess={() => {
          setPromptSave(false);
          void refreshFeed();
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
          <FeedScreen onPlayGame={startGame} />
        </View>
        <View style={[styles.tabPane, tab !== "live" && styles.hidden]}>
          <LiveNowScreen onProfile={() => setTab("profile")} />
        </View>
        <View style={[styles.tabPane, tab !== "friends" && styles.hidden]}>
          <FriendsScreen onSignIn={() => setShowSignIn(true)} />
        </View>
        <View style={[styles.tabPane, tab !== "profile" && styles.hidden]}>
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
