import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
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
import { createClock, type SessionClock } from "../../game/core/clock";
import type { GameDefinition } from "../../game/core/definition";
import { resolveGame } from "../../game/core/resolve";
import { randomSeed } from "../../game/core/rng";
import { engineRegistry } from "../../game/engines";
import { registerEngines } from "../../game/engines/manifest";
import { LEGACY_REPLACEMENTS } from "../../game/engines/replacements";
import type { QuizAction, QuizState } from "../../game/engines/quiz/logic/types";
import { QuizView } from "../../game/engines/quiz/ui/QuizView";
import { loadContent, resolveAsset } from "../../game/platform/content";
import { awaitEnginePrefetch, isEngineWarm, markEngineWarm, prefetchGame } from "../../game/platform/prefetchGame";
import { gameBus, levelStore, newSessionId } from "../../game/platform/services";
import { SessionRunner } from "../../game/session/runner";
import type { CompletedPlay } from "../../game/session/types";
import { feedback } from "../../game/ui/feedback";
import { Confetti, FlashOverlay, StreakBadge, TimerCountdown, usePop } from "../../game/ui/motion";
import type { EngineModule } from "../../game/ui/types";
import { localizeGame } from "../../i18n/games";
import { fill } from "../../i18n/strings";
import { capture } from "../../lib/analytics";
import { createChallenge } from "../../lib/challenges";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  item: FeedGame;
  height: number;
  isActive: boolean;
  onComplete: (play: CompletedPlay) => void;
  onChallengeStart?: (challenge: { id: string; seed: string }) => void;
  onSignIn?: () => void;
};

type ReadyBoot = {
  mod: EngineModule;
  runner: SessionRunner<QuizState, QuizAction, unknown>;
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

export function isInlineGuessGame(item: FeedGame): boolean {
  return item.engine === "guess" || item.config?.engine === "guess";
}

export function GuessFeedPage({
  item: raw,
  height,
  isActive,
  onComplete,
  onChallengeStart,
  onSignIn,
}: Props) {
  const { language, t, fonts: ui } = useLanguage();
  const { isSignedIn } = useAuth();
  const { friends, refreshFriends } = useApp();
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
  // Keep a just-finished session mounted so the complete→submit timeout can still fire.
  useEffect(() => {
    if (isActive) return;
    const prev = bootRef.current;
    if (prev.phase !== "ready") return;
    const status = prev.runner.getSnapshot().status;
    if (status === "completed") return;
    if (status === "ready" || status === "abandoned") {
      setBoot({ phase: "idle" });
      return;
    }
    if (status === "playing" || status === "roundOver" || status === "paused") {
      capture("game_abandoned", {
        game_id: raw.key,
        elapsed_seconds: Math.round(prev.runner.durationMs / 1000),
      });
      prev.runner.abandon();
      setBoot({ phase: "idle" });
    }
  }, [isActive, raw.key]);

  useEffect(() => {
    if (!isActive) return;

    const prev = bootRef.current;
    if (prev.phase === "ready" && prev.sessionKey === sessionKey) {
      const status = prev.runner.getSnapshot().status;
      // Fresh preview or a celebration still submitting — don't rebuild.
      if (status === "ready" || status === "completed") return;
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
      }) as SessionRunner<QuizState, QuizAction, unknown>;

      setBoot({ phase: "ready", mod, runner, clock, content, definition, sessionKey });
    })().catch((e: unknown) => {
      if (cancelled) return;
      if (__DEV__) console.warn(`[guess-feed] ${raw.key} failed`, e);
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
    <View style={[styles.page, { height }]}>
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
        style={[type.button, { color: colors.paper, fontFamily: ui.display, marginBottom: spacing.xs }]}
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
}: {
  boot: ReadyBoot;
  gameKey: string;
  isActive: boolean;
  showChallenge: boolean;
  onOpenChallenge: () => void;
  onComplete: (play: CompletedPlay) => void;
  onRestart: () => void;
}) {
  const { t, fonts: ui } = useLanguage();
  const { runner, clock, mod, definition, content } = boot;
  const snap = useSyncExternalStore(runner.subscribe, runner.getSnapshot);
  const scorePop = usePop(snap.score);
  const finished = useRef(false);
  const now = useCallback(() => clock.now(), [clock]);
  const idle = snap.status === "ready";

  const dispatch = useCallback(
    (action: QuizAction) => {
      if (runner.getSnapshot().status === "ready") {
        capture("game_started", {
          game_id: gameKey,
          game_type: definition.engine,
          source: "feed_inline",
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
    if (seq === undefined) return;
    feedback(correct ? "success" : "error");
  }, [seq, correct]);

  useEffect(() => {
    if (snap.status !== "completed" || finished.current) return;
    finished.current = true;
    feedback("complete");
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
    const id = setTimeout(() => onComplete(play), 900);
    return () => clearTimeout(id);
  }, [snap.status, snap.score, snap.level, snap.result, runner, mod, definition.variation, gameKey, onComplete]);

  const startPlay = useCallback(() => {
    if (runner.getSnapshot().status !== "ready") return;
    capture("game_started", {
      game_id: gameKey,
      game_type: definition.engine,
      source: "feed_inline",
    });
    runner.start();
  }, [runner, gameKey, definition.engine]);

  const leave = useCallback(() => {
    capture("game_abandoned", {
      game_id: gameKey,
      elapsed_seconds: Math.round(runner.durationMs / 1000),
    });
    runner.abandon();
    onRestart();
  }, [runner, gameKey, onRestart]);

  const state = snap.state as QuizState;
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
        <TimerCountdown deadline={snap.deadline} now={now} paused={snap.status !== "playing"} />
        <View style={styles.hudRight}>
          {!idle ? <StreakBadge streak={snap.streak} /> : null}
          <Animated.Text style={[type.statsSm, scorePop, { color: colors.lime, fontFamily: ui.bodyBold }]}>
            {snap.score}
          </Animated.Text>
        </View>
      </View>

      <View style={styles.playfield}>
        <QuizView
          snapshot={snap}
          state={state}
          dispatch={dispatch}
          requestHint={() => {}}
          now={now}
          definition={definition}
          content={content}
          resolveAsset={resolveAsset}
          allowReadyAnswer
          hideHints
          compact
        />
      </View>

      {idle ? (
        <View style={styles.actionRow}>
          {showChallenge ? (
            <PrimaryButton
              label={t("challenge")}
              variant="secondary"
              icon="flash-outline"
              onPress={onOpenChallenge}
              style={styles.actionBtn}
            />
          ) : null}
          <PrimaryButton
            label={t("playTrivia")}
            variant="success"
            trailingIcon="play"
            onPress={startPlay}
            style={styles.actionBtn}
          />
        </View>
      ) : null}

      <FlashOverlay seq={snap.lastOutcome?.seq} color={snap.lastOutcome?.correct ? colors.lime : colors.pink} />
      <Confetti active={snap.status === "completed"} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.margin,
    paddingTop: 100,
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
    padding: spacing.sm,
    overflow: "hidden",
  },
  errorBox: { flex: 1, justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.sm },
  playRoot: { flex: 1, minHeight: 0, position: "relative" },
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
    minHeight: 28,
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
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
