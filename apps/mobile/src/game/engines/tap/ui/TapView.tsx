import React, { memo, useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, spacing } from "../../../../theme/colors";
import { type } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import type { EngineViewProps } from "../../../ui/types";
import { useClock } from "../../../ui/useClock";
import { visibleTargets } from "../logic/spawn";
import type { TapAction, TapRule, TapState, TapTarget } from "../logic/types";

const GOLD = "#FFD84D";
const KIND_COLOR = { target: colors.lime, bonus: GOLD, decoy: colors.pink } as const;

type Size = { w: number; h: number };

export function TapView(props: EngineViewProps<TapState, TapAction>) {
  return props.state.mode === "reaction" ? <ReactionField {...props} /> : <TargetField {...props} />;
}

// ---------------------------------------------------------------------------------------------
// Rush / moles
// ---------------------------------------------------------------------------------------------

function TargetField({ state, dispatch, snapshot, now }: EngineViewProps<TapState, TapAction>) {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const playing = snapshot.status === "playing";
  const t = useClock(now, playing, 50);
  const visible = size.w ? visibleTargets(state.targets, state.done, t) : [];
  const short = Math.min(size.w, size.h);

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const onHit = useCallback(
    (tg: TapTarget) => {
      if (!playing) return;
      feedback(tg.kind === "decoy" ? "error" : "tap");
      dispatch({ type: "tap", id: tg.id });
    },
    [playing, dispatch],
  );

  return (
    <View style={styles.fieldWrap}>
      {state.rule ? <RuleBanner rule={state.rule} flipped={!!state.ruleFlipped} round={state.round} /> : null}
      <Pressable
        style={styles.field}
        onLayout={onLayout}
        onPressIn={() => {
          if (!playing) return;
          dispatch({ type: "tap", id: null });
        }}
        accessibilityLabel="Playfield. Tap targets as they appear."
      >
        {state.grid > 0 && size.w
          ? Array.from({ length: state.grid * state.grid }, (_, i) => {
              const cx = ((i % state.grid) + 0.5) / state.grid;
              const cy = (Math.floor(i / state.grid) + 0.5) / state.grid;
              const rp = (short / state.grid) * 0.36;
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[styles.hole, { left: cx * size.w - rp, top: cy * size.h - rp * 0.5, width: rp * 2, height: rp }]}
                />
              );
            })
          : null}
        {visible.map((tg) => (
          <Target key={tg.id} target={tg} size={size} now={t} grid={state.grid} rule={state.rule ?? null} onHit={onHit} />
        ))}
        {state.lastHit && size.w ? <FloatingPoints key={state.lastHit.id} hit={state.lastHit} size={size} /> : null}
      </Pressable>
      {snapshot.status === "roundOver" ? <RoundCard state={state} /> : null}
    </View>
  );
}

function RuleBanner({ rule, flipped, round }: { rule: TapRule; flipped: boolean; round: number }) {
  return (
    <Animated.View
      key={round}
      entering={prefersReducedMotion() ? undefined : FadeIn.duration(200)}
      style={[styles.rule, flipped && { borderColor: GOLD }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${flipped ? "Rules flipped. " : ""}Tap ${rule.tapLabel}. Don't tap ${rule.avoidLabel}.`}
    >
      {flipped ? <Text style={[type.metadata, { color: GOLD, letterSpacing: 1 }]}>RULES FLIPPED!</Text> : null}
      <View style={styles.ruleRow}>
        <Text style={[type.button, { color: colors.lime }]}>TAP {rule.tap.slice(0, 3).join("")}</Text>
        <Text style={[type.button, { color: colors.pink }]}>DON'T {rule.avoid.slice(0, 3).join("")}</Text>
      </View>
    </Animated.View>
  );
}

function targetLabel(kind: TapTarget["kind"], rule: TapRule | null) {
  if (kind === "decoy") return rule ? `${rule.avoidLabel}, don't tap` : "Decoy, don't tap";
  if (kind === "bonus") return "Bonus target";
  return rule ? `${rule.tapLabel}, tap` : "Target";
}

type TargetProps = { target: TapTarget; size: Size; now: number; grid: number; rule: TapRule | null; onHit: (t: TapTarget) => void };

/** `now` is only read on mount to start the animations, so clock ticks alone never re-render a target. */
const Target = memo(
  TargetImpl,
  (a, b) => a.target === b.target && a.size === b.size && a.grid === b.grid && a.rule === b.rule && a.onHit === b.onHit,
);

function TargetImpl({ target, size, now, grid, rule, onHit }: TargetProps) {
  const short = Math.min(size.w, size.h);
  const rp = Math.max(22, grid > 0 ? (short / grid) * 0.34 : target.r * short);
  const reduce = prefersReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.2);
  const life = useSharedValue(1);
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);

  useEffect(() => {
    const remaining = Math.max(50, target.at + target.ttl - now);
    scale.value = reduce ? 1 : withSpring(1, { damping: 12, stiffness: 260 });
    life.value = withTiming(0, { duration: remaining, easing: Easing.linear });
    dx.value = withTiming((target.x2 - target.x) * size.w, { duration: remaining, easing: Easing.linear });
    dy.value = withTiming((target.y2 - target.y) * size.h, { duration: remaining, easing: Easing.linear });
    // Animations are started once per target; later renders only move the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  const body = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }, { translateY: dy.value }, { scale: scale.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 0.55 + 0.45 * life.value }], opacity: 0.35 + 0.65 * life.value }));
  const color = rule ? colors.paper : KIND_COLOR[target.kind];

  return (
    <Animated.View
      style={[{ position: "absolute", left: target.x * size.w - rp, top: target.y * size.h - rp, width: rp * 2, height: rp * 2 }, body]}
    >
      <Pressable
        onPressIn={() => onHit(target)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={targetLabel(target.kind, rule)}
        style={styles.fill}
      >
        {target.emoji ? (
          <Text style={{ fontSize: rp * 1.25, lineHeight: rp * 1.6, textAlign: "center" }}>{target.emoji}</Text>
        ) : (
          <View style={[styles.fill, styles.dot, { backgroundColor: color, borderRadius: rp }]}>
            {target.kind === "decoy" ? <Text style={[styles.dotMark, { fontSize: rp * 0.9 }]}>✕</Text> : null}
            {target.kind === "bonus" ? <Text style={[styles.dotMark, { fontSize: rp * 0.8 }]}>★</Text> : null}
          </View>
        )}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: rp, borderWidth: 3, borderColor: color }, ring]} />
      </Pressable>
    </Animated.View>
  );
}

function FloatingPoints({ hit, size }: { hit: NonNullable<TapState["lastHit"]>; size: Size }) {
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    y.value = withTiming(-40, { duration: 600 });
    o.value = withTiming(0, { duration: 600 });
  }, [y, o]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: o.value }));
  return (
    <Animated.Text pointerEvents="none" style={[styles.points, { left: hit.x * size.w - 30, top: hit.y * size.h - 20 }, s]}>
      +{hit.points}
    </Animated.Text>
  );
}

function RoundCard({ state }: { state: TapState }) {
  const tries = state.roundHits + state.roundMisses + state.roundEscaped;
  const acc = tries ? Math.round((state.roundHits / tries) * 100) : 0;
  const last = state.round >= state.total || state.lives === 0;
  return (
    <Animated.View entering={FadeIn} style={styles.roundCard} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={[type.gameQuestion, { color: colors.paper, textAlign: "center" }]}>Round {state.round} done</Text>
      <Text style={[type.bodyLg, { color: colors.lilac, textAlign: "center" }]}>
        {state.roundHits} hits · {acc}% accuracy
      </Text>
      {!last ? <Text style={[type.bodySm, { color: colors.lime, textAlign: "center" }]}>Get ready…</Text> : null}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------------------------
// Reaction
// ---------------------------------------------------------------------------------------------

const CUE_MS = 350;

function ReactionField({ state, dispatch, snapshot, now }: EngineViewProps<TapState, TapAction>) {
  const playing = snapshot.status === "playing";
  const t = useClock(now, playing, 0);
  const go = state.goAt !== null && t >= state.goAt;
  const cue = !go && state.cueAt !== null && t >= state.cueAt && t < state.cueAt + CUE_MS;

  let bg: string = "#93000a";
  let title = "Wait for green…";
  let sub = "";
  if (state.roundOver) {
    if (state.falseStart) {
      bg = colors.cardAlt;
      title = "Too soon!";
      sub = "Wait for green";
    } else if (state.reactionMs !== null) {
      bg = colors.cardAlt;
      title = `${state.reactionMs} ms`;
      sub = state.reactionMs < 250 ? "Lightning!" : state.reactionMs < 350 ? "Quick!" : "Nice";
    } else {
      bg = colors.cardAlt;
      title = "Too slow!";
    }
  } else if (go) {
    bg = colors.limeLive;
    title = "TAP!";
  } else if (cue) {
    bg = GOLD;
    title = "Not yet…";
  }

  useEffect(() => {
    if (go && playing) feedback("select");
  }, [go, playing]);

  return (
    <View style={styles.fieldWrap}>
      <Pressable
        onPressIn={() => {
          if (playing) dispatch({ type: "tap", id: null });
        }}
        accessibilityRole="button"
        accessibilityLabel={go ? "Tap now" : "Wait for green, then tap"}
        style={[styles.field, styles.reaction, { backgroundColor: bg }]}
      >
        <Text style={[type.largeScore, { color: go || cue ? colors.ink : colors.paper, textAlign: "center" }]}>{title}</Text>
        {sub ? <Text style={[type.bodyLg, { color: colors.lilac, textAlign: "center" }]}>{sub}</Text> : null}
        {state.bestReactionMs !== null ? (
          <Text style={[type.bodySm, { color: go || cue ? colors.ink : colors.lilac, marginTop: spacing.md }]}>Best {state.bestReactionMs} ms</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { flex: 1, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  field: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.card, overflow: "hidden" },
  reaction: { alignItems: "center", justifyContent: "center", gap: spacing.sm },
  fill: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  dot: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  dotMark: { color: colors.ink, fontWeight: "800" },
  hole: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(0,0,0,0.35)" },
  rule: { alignItems: "center", marginBottom: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  ruleRow: { flexDirection: "row", gap: spacing.lg },
  points: { position: "absolute", width: 60, textAlign: "center", color: colors.lime, fontSize: 20, fontWeight: "800" },
  roundCard: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    top: "35%",
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.xs,
  },
});
