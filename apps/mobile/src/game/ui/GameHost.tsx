import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, AppState, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { ErrorState } from "../../components/ErrorState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";
import { ContentBundle } from "../content/types";
import { missingContent } from "../content/query";
import { SessionClock, createClock } from "../core/clock";
import { GameDefinition } from "../core/definition";
import { GameCard, resolveGame } from "../core/resolve";
import { randomSeed } from "../core/rng";
import { engineRegistry } from "../engines";
import { registerEngines } from "../engines/manifest";
import { LEGACY_REPLACEMENTS } from "../engines/replacements";
import { loadContent, resolveAsset } from "../platform/content";
import { gameBus, levelStore, newSessionId, sessionStore } from "../platform/services";
import { SessionRunner } from "../session/runner";
import { CompletedPlay, GameSession } from "../session/types";
import { feedback } from "./feedback";
import { GameFrame } from "./GameFrame";
import { Confetti, Countdown, FlashOverlay } from "./motion";
import { EngineModule } from "./types";

type Props = {
  card: GameCard;
  onComplete: (play: CompletedPlay) => void;
  /** Leave without submitting. */
  onExit: () => void;
  /** A recovered session to continue instead of starting fresh. */
  restore?: GameSession;
};

/** Android back leaves the game (screens without their own pause menu). */
function useBackToExit(onExit: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit, enabled]);
}

/** Plays any game card through the session runner of its engine. */
export function GameHost({ card, onComplete, onExit, restore }: Props) {
  registerEngines();
  const resolved = useMemo(
    () =>
      resolveGame(card, {
        hasEngine: (id) => engineRegistry.has(id),
        replacements: LEGACY_REPLACEMENTS,
      }),
    [card],
  );

  if (resolved.kind === "unavailable") {
    if (__DEV__) console.warn(`[game] ${card.key} unavailable: ${resolved.reason}`);
    return <Unavailable onExit={onExit} />;
  }

  return (
    <SdkSession
      key={`${card.key}:${restore?.sessionId ?? "new"}`}
      gameKey={card.key}
      title={card.title}
      definition={resolved.definition}
      restore={restore}
      onComplete={onComplete}
      onExit={onExit}
    />
  );
}

function Unavailable({ onExit }: { onExit: () => void }) {
  useBackToExit(onExit);
  return (
    <View style={styles.center}>
      <ErrorState title="Game unavailable" message="This game needs a newer version of the app, or isn't available right now." />
      <PrimaryButton label="Back to feed" onPress={onExit} />
    </View>
  );
}

type Ready = {
  mod: EngineModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runner: SessionRunner<any, any, any>;
  clock: SessionClock;
  content: ContentBundle;
  definition: GameDefinition;
};

type Boot = { phase: "loading" } | { phase: "error"; message: string } | ({ phase: "ready" } & Ready);

type SessionProps = {
  gameKey: string;
  title: string;
  definition: GameDefinition;
  restore?: GameSession;
  onComplete: (play: CompletedPlay) => void;
  onExit: () => void;
};

function SdkSession({ gameKey, title, definition, restore, onComplete, onExit }: SessionProps) {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  useBackToExit(onExit, boot.phase !== "ready");

  useEffect(() => {
    let cancelled = false;
    setBoot({ phase: "loading" });
    (async () => {
      const mod = await engineRegistry.load(definition.engine);
      const checked = mod.engine.checkDefinition(definition);
      if (!checked.ok) throw new Error(checked.error);
      const def = checked.value;
      const needs = mod.engine.contentNeeds(def);
      const content = await loadContent(needs, def);
      if (missingContent(content, needs)) throw new Error("content_unavailable");
      const startLevel = restore ? undefined : await levelStore.get(def.engine, def.variation).catch(() => undefined);
      const clock = createClock({ paused: true, elapsedMs: restore?.activeElapsedMs });
      const runner = new SessionRunner({
        engine: mod.engine,
        definition: def,
        content,
        gameKey,
        sessionId: restore?.sessionId ?? newSessionId(),
        seed: restore?.seed ?? randomSeed(),
        clock,
        bus: gameBus,
        startLevel,
        targetResponseMs: mod.targetResponseMs,
        restore,
      });
      if (!cancelled) setBoot({ phase: "ready", mod, runner, clock, content, definition: def });
    })().catch((e: unknown) => {
      if (cancelled) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) console.warn(`[game] ${gameKey} failed to start: ${msg}`);
      if (restore) void sessionStore.clear();
      setBoot({
        phase: "error",
        message:
          msg === "content_unavailable"
            ? "This game's content couldn't be loaded. Check your connection and try again."
            : "This game couldn't start. Try again in a moment.",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, definition, gameKey, restore]);

  if (boot.phase === "loading") {
    return (
      <View style={styles.center} accessibilityLabel="Loading game">
        <ActivityIndicator color={colors.lime} size="large" />
      </View>
    );
  }
  if (boot.phase === "error") {
    return (
      <View style={styles.center}>
        <ErrorState title="Couldn't start the game" message={boot.message} onRetry={() => setAttempt((n) => n + 1)} />
        <PrimaryButton label="Back to feed" variant="secondary" onPress={onExit} />
      </View>
    );
  }
  return <ActiveSession {...boot} gameKey={gameKey} title={title} restored={!!restore} onComplete={onComplete} onExit={onExit} />;
}

type ActiveProps = Ready & {
  gameKey: string;
  title: string;
  restored: boolean;
  onComplete: (play: CompletedPlay) => void;
  onExit: () => void;
};

function ActiveSession({ mod, runner, clock, content, definition, gameKey, title, restored, onComplete, onExit }: ActiveProps) {
  const snap = useSyncExternalStore(runner.subscribe, runner.getSnapshot);
  const [counting, setCounting] = useState(!restored && snap.status === "ready");
  const [menuOpen, setMenuOpen] = useState(restored && snap.status === "paused");
  const [levelUp, setLevelUp] = useState(false);
  const finished = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const { meta } = mod.engine;
  const View_ = mod.View;
  const now = useCallback(() => clock.now(), [clock]);

  const persist = useCallback(() => {
    void sessionStore.save({ ...runner.serialize(), title }).catch(() => {});
  }, [runner, title]);

  // Single shared ticker: engine tick interval, or a coarse one for deadline-driven engines.
  const tickMs = meta.tickMs ?? (snap.deadline !== undefined ? 250 : 0);
  useEffect(() => {
    if (snap.status !== "playing" || !tickMs) return;
    const id = setInterval(() => runner.tick(), tickMs);
    return () => clearInterval(id);
  }, [snap.status, tickMs, runner]);

  // Round transitions: brief pause for feedback, then the next round.
  useEffect(() => {
    if (snap.status !== "roundOver") return;
    persist();
    const id = setTimeout(() => runner.advance(), meta.roundEndDelayMs ?? 900);
    return () => clearTimeout(id);
  }, [snap.status, snap.round, runner, meta.roundEndDelayMs, persist]);

  // Answer feedback.
  const seq = snap.lastOutcome?.seq;
  const correct = snap.lastOutcome?.correct;
  const quiet = !!mod.quietOutcomes;
  useEffect(() => {
    if (seq === undefined || quiet) return;
    feedback(correct ? "success" : "error");
  }, [seq, correct, quiet]);

  // Level-up toast.
  const prevLevel = useRef(snap.level);
  useEffect(() => {
    if (snap.level > prevLevel.current + 1e-6) {
      feedback("levelUp");
      setLevelUp(true);
      const id = setTimeout(() => setLevelUp(false), 1200);
      prevLevel.current = snap.level;
      return () => clearTimeout(id);
    }
    prevLevel.current = snap.level;
  }, [snap.level]);

  // Completion: persist level, clear the saved session, celebrate, hand the play to the app.
  useEffect(() => {
    if (snap.status !== "completed") return;
    if (!finished.current) {
      finished.current = true;
      feedback("complete");
      void sessionStore.clear().catch(() => {});
      void levelStore.set(definition.engine, definition.variation, snap.level).catch(() => {});
    }
    const r = snap.result;
    const play: CompletedPlay = {
      gameKey,
      score: snap.score,
      durationMs: Math.round(runner.durationMs),
      sessionId: runner.sessionId,
      engine: meta.id,
      variation: definition.variation,
      engineVersion: meta.version,
      seed: runner.serialize().seed,
      level: snap.level,
      correct: r?.correct,
      attempts: r?.attempts,
      breakdown: r?.breakdown,
      rounds: runner.rounds,
    };
    const id = setTimeout(() => onCompleteRef.current(play), 1100);
    return () => clearTimeout(id);
    // Fires once per session; the snapshot is final once status is "completed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.status]);

  // App backgrounded: pause and save so the session can be recovered.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") return;
      if (runner.getSnapshot().status === "playing" || runner.getSnapshot().status === "roundOver") {
        runner.pause();
        setMenuOpen(true);
      }
      persist();
    });
    return () => sub.remove();
  }, [runner, persist]);

  // Leaving the screen without finishing abandons the session.
  useEffect(
    () => () => {
      const s = runner.getSnapshot().status;
      if (s !== "completed" && s !== "abandoned") runner.abandon();
    },
    [runner],
  );

  const openMenu = useCallback(() => {
    runner.pause();
    persist();
    setMenuOpen(true);
  }, [runner, persist]);

  const resume = useCallback(() => {
    setMenuOpen(false);
    runner.resume();
  }, [runner]);

  const quit = useCallback(() => {
    runner.abandon();
    void sessionStore.clear().catch(() => {});
    onExit();
  }, [runner, onExit]);

  const endNow = useCallback(() => {
    setMenuOpen(false);
    runner.end();
  }, [runner]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (runner.getSnapshot().status === "completed") return true;
      if (menuOpen) resume();
      else openMenu();
      return true;
    });
    return () => sub.remove();
  }, [menuOpen, openMenu, resume, runner]);

  const dispatch = useCallback((a: unknown) => runner.dispatch(a), [runner]);
  const requestHint = useCallback((id: string) => void runner.useHint(id), [runner]);

  if (snap.error) {
    return (
      <View style={styles.center}>
        <ErrorState title="Something went wrong" message="This game hit a problem and had to stop." />
        <PrimaryButton label="Back to feed" onPress={quit} />
      </View>
    );
  }

  const variationTitle = meta.variations.find((v) => v.id === definition.variation)?.title;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <GameFrame title={title} subtitle={variationTitle?.toUpperCase()} snapshot={snap} now={now} onPause={openMenu}>
        <View_
          snapshot={snap}
          state={snap.state}
          dispatch={dispatch}
          requestHint={requestHint}
          now={now}
          definition={definition}
          content={content}
          resolveAsset={resolveAsset}
        />
      </GameFrame>
      {quiet ? null : <FlashOverlay seq={snap.lastOutcome?.seq} color={snap.lastOutcome?.correct ? colors.lime : colors.pink} />}
      <Confetti active={snap.status === "completed"} />
      {levelUp ? (
        <View pointerEvents="none" style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={[type.button, { color: colors.ink }]}>Level up!</Text>
        </View>
      ) : null}
      {counting ? (
        <Countdown
          onDone={() => {
            setCounting(false);
            runner.start();
          }}
        />
      ) : null}
      {menuOpen ? (
        <View style={styles.menuBackdrop}>
          <View style={styles.menu} accessibilityViewIsModal>
            <Text style={[type.gameQuestion, { color: colors.paper, textAlign: "center" }]}>Paused</Text>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", marginBottom: spacing.md }]}>
              Score {snap.score}
              {snap.totalRounds ? ` · Round ${snap.round}/${snap.totalRounds}` : ""}
            </Text>
            <PrimaryButton label="Resume" onPress={resume} />
            <PrimaryButton label="End & save score" variant="secondary" onPress={endNow} />
            <Pressable onPress={quit} accessibilityRole="button" style={{ padding: spacing.sm, minHeight: 44, justifyContent: "center" }}>
              <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>Quit without saving</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.ink, padding: spacing.lg, justifyContent: "center", gap: spacing.md },
  toast: {
    position: "absolute",
    top: "40%",
    alignSelf: "center",
    backgroundColor: colors.lime,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(21,14,43,0.88)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  menu: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
