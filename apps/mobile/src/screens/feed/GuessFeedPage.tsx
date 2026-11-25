import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedGame, isApiError } from "../../api";
import { FriendPickerModal } from "../../components/FriendPickerModal";
import { LivePill } from "../../components/MajaLogo";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenLoading } from "../../components/ScreenLoading";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import type { ContentBundle } from "../../game/content/types";
import { missingContent } from "../../game/content/query";
import { usedIdsFromState } from "../../game/content/recent";
import { createClock, type SessionClock } from "../../game/core/clock";
import type { GameDefinition } from "../../game/core/definition";
import { resolveGame } from "../../game/core/resolve";
import { randomSeed } from "../../game/core/rng";
import { engineRegistry } from "../../game/engines";
import { registerEngines } from "../../game/engines/manifest";
import { LEGACY_REPLACEMENTS } from "../../game/engines/replacements";
import { isInlineFeedGame } from "../../game/inlineFeed";
import { loadContent, resolveAsset } from "../../game/platform/content";
import { awaitEnginePrefetch, isEngineWarm, markEngineWarm, prefetchGame } from "../../game/platform/prefetchGame";
import { gameBus, levelStore, newSessionId, recentIdsStore } from "../../game/platform/services";
import { SessionRunner } from "../../game/session/runner";
import type { CompletedPlay } from "../../game/session/types";
import { feedback } from "../../game/ui/feedback";
import { Confetti, FlashOverlay, StreakBadge, TimerCountdown, usePop } from "../../game/ui/motion";
import type { EngineModule } from "../../game/ui/types";
import { localizeGame } from "../../i18n/games";
import { fill } from "../../i18n/strings";
import { capture, gamePlayProps } from "../../lib/analytics";
import { createChallenge } from "../../lib/challenges";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";
import { completionHandoffPlan } from "./completionHandoff";

export { isInlineFeedGame } from "../../game/inlineFeed";

/** Clears absolute FeedTopBar (avatar row ~40 + padding). */
const FEED_TOP_CLEARANCE = 56;

/** @deprecated Prefer `isInlineFeedGame` — kept for FeedScreen import stability. */
export const isInlineGuessGame = isInlineFeedGame;

type Props = {
  item: FeedGame;
  height: number;
  isActive: boolean;
  onComplete: (play: CompletedPlay) => void;
  onChallengeStart?: (challenge: { id: string; seed: string }) => void;
  onSignIn?: () => void;
  /** True while an in-feed round is live — parent can lock the paging feed. */
  onPlayingChange?: (playing: boolean) => void;
};

type ReadyBoot = {
  mod: EngineModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runner: SessionRunner<any, any, unknown>;
  clock: SessionClock;
  content: ContentBundle;
  definition: GameDefinition;
  sessionKey: number;
};

type Boot =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | ({ phase: "ready" } & ReadyBoot);

export function GuessFeedPage({
  item: raw,
  height,
  isActive,
  onComplete,
  onChallengeStart,
  onSignIn,
  onPlayingChange,
}: Props) {
  const { language, t, fonts: ui } = useLanguage();
  const { isSignedIn } = useAuth();
  const { friends, refreshFriends } = useApp();
  const insets = useSafeAreaInsets();
  const item = localizeGame(raw, language);
  const tag =
    typeof item.config?.tag === "string" && item.config.tag.trim()
      ? String(item.config.tag).toUpperCase()
      : t("gameTag");

  const [boot, setBoot] = useState<Boot>({ phase: "idle" });
  const bootRef = useRef(boot);
  bootRef.current = boot;
  const [sessionKey, setSessionKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyFriend, setBusyFriend] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    prefetchGame(raw);
  }, [isActive, raw.key, raw.engine, raw.variation]);

  // Tear down when the card leaves view — swipe-away abandons an in-progress round.
  // Mid-play uses a long debounce: locking the feed / RefreshControl can flicker viewability
  // on the first PLAY tap; a short teardown remounted as loading (blank) then idle PLAY again.
  // Keep a just-finished session mounted so the complete→submit timeout can still fire.
  useEffect(() => {
    if (isActive) return;
    const prev = bootRef.current;
    if (prev.phase !== "ready") return;
    const status = prev.runner.getSnapshot().status;
    if (status === "completed") return;

    const live = status === "playing" || status === "roundOver" || status === "paused";
    const timer = setTimeout(() => {
      const latest = bootRef.current;
      if (latest.phase !== "ready") return;
      const now = latest.runner.getSnapshot().status;
      if (now === "completed") return;
      if (now === "ready" || now === "abandoned") {
        setBoot({ phase: "idle" });
        return;
      }
      if (now === "playing" || now === "roundOver" || now === "paused") {
        capture("game_abandoned", {
          game_id: raw.key,
          elapsed_seconds: Math.round(latest.runner.durationMs / 1000),
        });
        latest.runner.abandon();
        setBoot({ phase: "idle" });
      }
    }, live ? 1800 : 450);
    return () => clearTimeout(timer);
  }, [isActive, raw.key]);

  useEffect(() => {
    if (!isActive) return;

    const prev = bootRef.current;
    if (prev.phase === "ready" && prev.sessionKey === sessionKey) {
      const status = prev.runner.getSnapshot().status;
      // Keep live / finished sessions — never rebuild mid-play (that made PLAY "vanish").
      if (
        status === "ready" ||
        status === "completed" ||
        status === "playing" ||
        status === "roundOver" ||
        status === "paused"
      ) {
        return;
      }
    }

    let cancelled = false;
    setBoot({ phase: "loading" });
    (async () => {
      registerEngines();
      const resolved = resolveGame(raw, {
        hasEngine: (id) => engineRegistry.has(id),
        replacements: LEGACY_REPLACEMENTS,
      });
      if (resolved.kind !== "sdk") throw new Error("unavailable");
      const def = resolved.definition;
      await awaitEnginePrefetch(def.engine, def.variation);
      const mod = await engineRegistry.load(def.engine);
      const checked = mod.engine.checkDefinition(def);
      if (!checked.ok) throw new Error(checked.error);
      const definition = checked.value;
      const needs = mod.engine.contentNeeds(definition);
      const warmed = isEngineWarm(definition.engine, definition.variation);
      const content = await loadContent(needs, definition, { assetBudgetMs: warmed ? 0 : 400 });
      if (missingContent(content, needs)) throw new Error("content");
      markEngineWarm(definition.engine, definition.variation);
      const startLevel = await levelStore.get(definition.engine, definition.variation).catch(() => undefined);
      // Same recent-ids avoidance as GameHost so in-feed Play Again / restarts skip the last set.
      const avoidIds = await recentIdsStore.get(definition.engine, definition.variation).catch(() => [] as string[]);
      if (cancelled) return;

      const clock = createClock({ paused: true });
      const runner = new SessionRunner({
        engine: mod.engine,
        definition,
        content,
        gameKey: raw.key,
        sessionId: newSessionId(),
        seed: randomSeed(),
        clock,
        bus: gameBus,
        startLevel,
        targetResponseMs: mod.targetResponseMs,
        avoidIds,
      });

      setBoot({ phase: "ready", mod, runner, clock, content, definition, sessionKey });
    })().catch((e: unknown) => {
      if (cancelled) return;
      if (__DEV__) console.warn(`[inline-feed] ${raw.key} failed`, e);
      setBoot({
        phase: "error",
        message: e instanceof Error && e.message === "content" ? "content" : "start",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isActive, sessionKey, raw.key, raw.engine, raw.variation]);

  const restartPreview = useCallback(() => {
    setSessionKey((n) => n + 1);
  }, []);

  async function challengeFriend(userId: string, name: string) {
    setBusyFriend(userId);
    try {
      const created = await createChallenge({ opponentUserId: userId, gameKey: raw.key });
      setPickerOpen(false);
      Alert.alert(t("challengeFriend"), fill(t("challengeSent"), { name }));
      onChallengeStart?.({ id: created.id, seed: created.seed });
    } catch (e) {
      Alert.alert(t("challengeFriend"), isApiError(e) ? e.userMessage : t("challengeSendFailed"));
    } finally {
      setBusyFriend(null);
    }
  }

  return (
    <View style={[styles.page, { height, paddingTop: insets.top + FEED_TOP_CLEARANCE }]}>
      <LinearGradient colors={["rgba(198,255,61,0.16)", "transparent", colors.ink]} style={StyleSheet.absoluteFill} />
      <View style={styles.glow} />

      <View style={styles.metaRow}>
        <View style={styles.tag}>
          <Text style={[type.micro, styles.tagText, { fontFamily: ui.bodyBold }]} numberOfLines={1}>
            {tag}
          </Text>
        </View>
        <LivePill label={t("inFeed")} />
      </View>
      <Text
        style={[type.button, { color: colors.paper, fontFamily: ui.display, marginBottom: spacing.sm }]}
        numberOfLines={1}
      >
        {item.title}
      </Text>

      <View style={styles.card}>
        {boot.phase === "loading" || boot.phase === "idle" ? (
          <ScreenLoading label={t("loadingGame")} style={{ flex: 1, backgroundColor: "transparent" }} />
        ) : null}
        {boot.phase === "error" ? (
          <View style={styles.errorBox}>
            <Text style={[type.bodyLg, { color: colors.paper, textAlign: "center", fontFamily: ui.bodyBold }]}>
              {t("couldntStart")}
            </Text>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: ui.body }]}>
              {boot.message === "content" ? t("contentUnavailable") : t("couldntStartBody")}
            </Text>
            <PrimaryButton label={t("retry")} onPress={restartPreview} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}
        {boot.phase === "ready" ? (
          <ActiveGuess
            boot={boot}
            gameKey={raw.key}
            isActive={isActive}
            showChallenge={Boolean(onChallengeStart)}
            onOpenChallenge={() => {
              void refreshFriends();
              setPickerOpen(true);
            }}
            onComplete={onComplete}
            onRestart={restartPreview}
            onPlayingChange={onPlayingChange}
          />
        ) : null}
      </View>

      <FriendPickerModal
        visible={pickerOpen}
        friends={friends}
        signedIn={isSignedIn}
        busyUserId={busyFriend}
        onClose={() => setPickerOpen(false)}
        onSignIn={onSignIn}
        onSelect={(f) => void challengeFriend(f.userId, f.displayName)}
      />
    </View>
  );
}

function ActiveGuess({
  boot,
  gameKey,
  isActive,
  showChallenge,
  onOpenChallenge,
  onComplete,
  onRestart,
  onPlayingChange,
}: {
  boot: ReadyBoot;
  gameKey: string;
  isActive: boolean;
  showChallenge: boolean;
  onOpenChallenge: () => void;
  onComplete: (play: CompletedPlay) => void;
  onRestart: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { t, fonts: ui } = useLanguage();
  const { runner, clock, mod, definition, content } = boot;
  const EngineView = mod.View;
  const quiet = !!mod.quietOutcomes;
  const snap = useSyncExternalStore(runner.subscribe, runner.getSnapshot);
  const scorePop = usePop(snap.score);
  const finished = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  /** Hide glass immediately on tap — don't wait a frame for the store (avoids "PLAY stuck"). */
  const [playArmed, setPlayArmed] = useState(false);
  const now = useCallback(() => clock.now(), [clock]);
  const idle = snap.status === "ready" && !playArmed;
  // Keep the feed locked through "completed" until the result handoff fires — unlocking
  // earlier re-rendered the parent and used to clear the onComplete timeout.
  const live =
    snap.status === "playing" ||
    snap.status === "roundOver" ||
    snap.status === "paused" ||
    snap.status === "completed" ||
    playArmed;

  useEffect(() => {
    if (snap.status !== "ready") setPlayArmed(false);
  }, [snap.status, boot.sessionKey]);

  // Only the live card toggles the feed lock. Sibling cards must not call false (that re-enabled
  // swipe mid-round and tore the session down → blank screen / PLAY stuck).
  useEffect(() => {
    if (!live) return;
    onPlayingChange?.(true);
    return () => onPlayingChange?.(false);
  }, [live, onPlayingChange]);

  const dispatch = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (action: any) => {
      if (runner.getSnapshot().status === "ready") {
        capture("game_started", {
          game_id: gameKey,
          game_type: definition.engine,
          source: "feed_inline",
          ...gamePlayProps(),
        });
        runner.start();
      }
      return runner.dispatch(action);
    },
    [runner, gameKey, definition.engine],
  );

  const tickMs = mod.engine.meta.tickMs ?? (snap.deadline !== undefined ? 250 : 0);
  useEffect(() => {
    if (!isActive || snap.status !== "playing" || !tickMs) return;
    const id = setInterval(() => runner.tick(), tickMs);
    return () => clearInterval(id);
  }, [isActive, snap.status, tickMs, runner]);

  useEffect(() => {
    if (snap.status !== "roundOver") return;
    const id = setTimeout(() => runner.advance(), mod.engine.meta.roundEndDelayMs ?? 900);
    return () => clearTimeout(id);
  }, [snap.status, snap.round, runner, mod.engine.meta.roundEndDelayMs]);

  const seq = snap.lastOutcome?.seq;
  const correct = snap.lastOutcome?.correct;
  useEffect(() => {
    if (quiet || seq === undefined) return;
    feedback(correct ? "success" : "error");
  }, [quiet, seq, correct]);

  // Completion handoff: unlocking the feed (live→false) re-renders FeedScreen with a new
  // onComplete identity. If we clearTimeout on that churn while finished stays true, the
  // result screen never opens — same pattern as GameHost (ref + status-only deps).
  useEffect(() => {
    const plan = completionHandoffPlan(snap.status, finished.current);
    if (!plan.scheduleHandoff) return;
    if (plan.runSideEffects) {
      finished.current = true;
      feedback("complete");
      void levelStore.set(definition.engine, definition.variation, snap.level).catch(() => {});
      const seen = usedIdsFromState(snap.state);
      if (seen.length) {
        void recentIdsStore.record(definition.engine, definition.variation, seen).catch(() => {});
      }
    }
    const r = snap.result;
    const serialized = runner.serialize();
    const play: CompletedPlay = {
      gameKey,
      score: snap.score,
      durationMs: Math.round(runner.durationMs),
      sessionId: runner.sessionId,
      engine: mod.engine.meta.id,
      variation: definition.variation,
      engineVersion: mod.engine.meta.version,
      seed: serialized.seed,
      level: snap.level,
      correct: r?.correct,
      attempts: r?.attempts,
      breakdown: r?.breakdown,
      rounds: runner.rounds,
    };
    const id = setTimeout(() => onCompleteRef.current(play), 900);
    return () => clearTimeout(id);
    // Snapshot is final once status is "completed"; identity churn must not drop the handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.status]);

  const startPlay = useCallback(() => {
    if (runner.getSnapshot().status !== "ready") return;
    // Lock paging before start() so FlatList can't steal the tap / flicker viewability.
    setPlayArmed(true);
    onPlayingChange?.(true);
    feedback("select");
    capture("game_started", {
      game_id: gameKey,
      game_type: definition.engine,
      source: "feed_inline",
      ...gamePlayProps(),
    });
    runner.start();
  }, [runner, gameKey, definition.engine, onPlayingChange]);

  const leave = useCallback(() => {
    capture("game_abandoned", {
      game_id: gameKey,
      elapsed_seconds: Math.round(runner.durationMs / 1000),
    });
    runner.abandon();
    onRestart();
  }, [runner, gameKey, onRestart]);

  const total = snap.totalRounds;
  const roundLabel = total
    ? `${Math.min(snap.round || 1, total)}/${total}`
    : fill(t("roundOnly"), { round: Math.max(1, snap.round) });

  return (
    <View style={styles.playRoot}>
      <View style={styles.hud}>
        {idle ? (
          <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>{roundLabel}</Text>
        ) : (
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel={t("leaveTrivia")}
            hitSlop={10}
            style={styles.leaveBtn}
          >
            <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>{t("leaveTrivia")}</Text>
          </Pressable>
        )}
        {!idle ? (
          <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>{roundLabel}</Text>
        ) : null}
        {!idle ? <TimerCountdown deadline={snap.deadline} now={now} paused={snap.status !== "playing"} /> : null}
        <View style={styles.hudRight}>
          {!idle ? <StreakBadge streak={snap.streak} /> : null}
          <Animated.Text style={[type.statsSm, scorePop, { color: colors.lime, fontFamily: ui.bodyBold }]}>
            {snap.score}
          </Animated.Text>
        </View>
      </View>

      <View style={styles.playfield} pointerEvents={idle ? "none" : "auto"}>
        <InlinePlayErrorBoundary onReset={onRestart} title={t("couldntStart")} retryLabel={t("retry")}>
          <EngineView
            snapshot={snap}
            state={snap.state}
            dispatch={dispatch}
            requestHint={() => {}}
            now={now}
            definition={definition}
            content={content}
            resolveAsset={resolveAsset}
            hideHints
            compact
          />
        </InlinePlayErrorBoundary>
      </View>

      {idle ? (
        <PlayNowBar onPlay={startPlay} showChallenge={showChallenge} onChallenge={onOpenChallenge} />
      ) : null}

      {quiet ? null : (
        <FlashOverlay seq={snap.lastOutcome?.seq} color={snap.lastOutcome?.correct ? colors.lime : colors.pink} />
      )}
      <Confetti active={snap.status === "completed"} />
    </View>
  );
}

/** Keeps an engine render crash from blanking the whole feed page. */
class InlinePlayErrorBoundary extends Component<
  { onReset: () => void; title: string; retryLabel: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.warn("[inline-feed] view crash", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.errorBox}>
        <Text style={[type.bodyLg, { color: colors.paper, textAlign: "center" }]}>{this.props.title}</Text>
        <PrimaryButton
          label={this.props.retryLabel}
          onPress={() => {
            this.setState({ failed: false });
            this.props.onReset();
          }}
        />
      </View>
    );
  }
}

/** Bottom CTA bar — preview stays visible; no full-card PLAY overlay. */
function PlayNowBar({
  onPlay,
  showChallenge,
  onChallenge,
}: {
  onPlay: () => void;
  showChallenge: boolean;
  onChallenge: () => void;
}) {
  const { t, fonts: ui } = useLanguage();

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      style={styles.playBar}
    >
      <Pressable
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel={t("playTrivia")}
        accessibilityHint={t("tapAnswerToPlay")}
        hitSlop={6}
        style={({ pressed }) => [styles.playNowBtn, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]}
      >
        <Ionicons name="play" size={18} color={colors.ink} />
        <Text style={[type.button, { color: colors.ink, fontFamily: ui.bodyBold }]}>{t("playTrivia")}</Text>
      </Pressable>

      {showChallenge ? (
        <Pressable
          onPress={onChallenge}
          accessibilityRole="button"
          accessibilityLabel={t("challenge")}
          hitSlop={8}
          style={({ pressed }) => [styles.challengeChip, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="flash-outline" size={14} color={colors.paper} />
          <Text style={[type.micro, { color: colors.paper, fontFamily: ui.bodyMedium }]}>{t("challenge")}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.lg,
  },
  glow: {
    position: "absolute",
    top: 72,
    right: -36,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(198,255,61,0.1)",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tag: {
    borderWidth: 1,
    borderColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "55%",
  },
  tagText: { color: colors.lime },
  card: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    overflow: "hidden",
  },
  errorBox: { flex: 1, justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.sm },
  playRoot: { flex: 1, minHeight: 0 },
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.xs,
  },
  hudRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: spacing.sm },
  leaveBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  playfield: { flex: 1, minHeight: 0 },
  playBar: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: "center",
  },
  playNowBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
    paddingHorizontal: spacing.lg,
  },
  challengeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(21,14,43,0.45)",
    borderWidth: 1,
    borderColor: "rgba(245,240,255,0.18)",
  },
});
