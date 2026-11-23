import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { fonts } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import type { EngineViewProps } from "../../../ui/types";
import { DIR_DELTA, DIR_GLYPH, DIR_NAME, type Dir, isFree } from "../logic/board";
import type { ArrowAction, ArrowState } from "../logic/engine";

const LAVENDER = "#F3F0FA";
const PURPLE = "#635BFF";
const INK = "#1C1430";
const MUTED = "#8B849C";
const EMPTY = "#EEEAF6";
const CORAL = "#FF4D6D";
const TRACK = "#E4DFF3";

const bestKey = (variation: string) => `maja_arrow_best_ms_${variation}`;

/** Format elapsed ms as 12.3s or 1:05.2. */
export function formatElapsed(ms: number): string {
  const t = Math.max(0, ms);
  const whole = Math.floor(t / 1000);
  const tenths = Math.floor((t % 1000) / 100);
  if (whole < 60) return `${whole}.${tenths}s`;
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
}

function useStopwatch(startedAt: number, penaltyMs: number, finishedMs: number | null, now: () => number, paused: boolean) {
  const read = () => {
    if (finishedMs != null) return finishedMs;
    return Math.max(0, now() - startedAt) + penaltyMs;
  };
  const [elapsed, setElapsed] = useState(read);
  useEffect(() => {
    const tick = () => setElapsed(read());
    tick();
    if (paused || finishedMs != null) return;
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
    // `now` is a stable session clock; `read` closes over the latest start/penalty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, penaltyMs, finishedMs, paused, now]);
  return elapsed;
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>
        {label ? `${label} ` : ""}
        <Text style={[styles.pillValue, accent && { color: PURPLE }]}>{value}</Text>
      </Text>
    </View>
  );
}

type Fly = { key: number; dir: Dir; x: number; y: number; size: number };

function FlyingArrow({ fly, onDone }: { fly: Fly; onDone: () => void }) {
  const [dx, dy] = DIR_DELTA[fly.dir];
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const dist = fly.size * 1.35;
    const ms = prefersReducedMotion() ? 1 : 220;
    const finish = () => onDone();
    tx.value = withTiming(dx * dist, { duration: ms, easing: Easing.out(Easing.cubic) });
    ty.value = withTiming(dy * dist, { duration: ms, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: ms, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(finish)();
    });
  }, [dx, dy, fly.size, onDone, opacity, tx, ty]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.tile, styles.flyer, { left: fly.x, top: fly.y, width: fly.size, height: fly.size }, style]}
    >
      <Text style={[styles.glyph, { fontSize: Math.max(16, fly.size * 0.46), lineHeight: Math.max(18, fly.size * 0.5) }]}>
        {DIR_GLYPH[fly.dir]}
      </Text>
    </Animated.View>
  );
}

export function ArrowView({ state, dispatch, snapshot, now, compact }: EngineViewProps<ArrowState, ArrowAction>) {
  const playing = snapshot.status === "playing" && !state.roundOver;
  const elapsed = useStopwatch(state.roundStart, state.penaltyMs, state.finishMs, now, !playing);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [bestMs, setBestMs] = useState<number | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const flyKey = useRef(0);
  const seq = snapshot.lastOutcome?.seq;
  const correct = snapshot.lastOutcome?.correct;
  const left = Math.max(0, state.total - state.cleared);
  const pct = state.total > 0 ? Math.min(1, state.cleared / state.total) : 0;

  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(bestKey(state.variation)).then((raw) => {
      const n = raw ? Number(raw) : NaN;
      if (live && Number.isFinite(n) && n > 0) setBestMs(Math.floor(n));
    });
    return () => {
      live = false;
    };
  }, [state.variation]);

  useEffect(() => {
    if (state.finishMs == null) return;
    if (bestMs != null && state.finishMs >= bestMs) return;
    setBestMs(state.finishMs);
    void AsyncStorage.setItem(bestKey(state.variation), String(state.finishMs));
  }, [state.finishMs, state.variation, bestMs]);

  useEffect(() => {
    if (seq === undefined) return;
    feedback(correct ? "success" : "error");
  }, [seq, correct]);

  const gap = compact ? 5 : 8;
  const pad = compact ? 8 : 14;
  const cols = state.cols;
  const rows = state.rows;
  const cell =
    box.w > 0 && box.h > 0 && cols > 0
      ? Math.floor(Math.min((box.w - pad * 2 - gap * (cols - 1)) / cols, (box.h - pad * 2 - gap * (rows - 1)) / rows))
      : 0;
  const boardW = cell > 0 ? pad * 2 + cols * cell + gap * (cols - 1) : 0;
  const boardH = cell > 0 ? pad * 2 + rows * cell + gap * (rows - 1) : 0;
  const blocked = state.flash && !state.flash.ok ? state.flash.index : -1;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const launchFly = (index: number, dir: Dir) => {
    if (cell <= 0 || prefersReducedMotion()) return;
    const x = index % cols;
    const y = Math.floor(index / cols);
    flyKey.current += 1;
    setFly({
      key: flyKey.current,
      dir,
      x: pad + x * (cell + gap),
      y: pad + y * (cell + gap),
      size: cell,
    });
  };

  const onTap = (index: number, dir: Dir) => {
    if (!playing) return;
    if (isFree(state.cells, cols, rows, index)) launchFly(index, dir);
    dispatch({ type: "tap", index });
  };

  const bestLabel = bestMs != null ? formatElapsed(bestMs) : "—";

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <View style={[styles.pills, compact && styles.pillsCompact]}>
        <Pill label="Left" value={String(left)} accent />
        <Pill label="" value={formatElapsed(elapsed)} accent />
        <Pill label="Best" value={bestLabel} />
      </View>
      <View
        style={[styles.track, compact && styles.trackCompact]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      >
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <View style={styles.stage} onLayout={onLayout}>
        {cell > 8 ? (
          <View
            style={[styles.board, compact && styles.boardCompact, { width: boardW, height: boardH, padding: pad, gap }]}
            accessible
            accessibilityLabel={`${cols} by ${rows} arrow board. ${left} left. ${formatElapsed(elapsed)} elapsed.`}
          >
            {Array.from({ length: rows }, (_, y) => (
              <View key={y} style={[styles.row, { gap }]}>
                {Array.from({ length: cols }, (_, x) => {
                  const i = y * cols + x;
                  const dir = state.cells[i];
                  if (dir == null) return <View key={i} style={[styles.empty, { width: cell, height: cell }]} />;
                  const free = isFree(state.cells, cols, rows, i);
                  return (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={`${DIR_NAME[dir]} arrow`}
                      accessibilityHint={free ? "Path is clear" : "Something is in the way"}
                      accessibilityState={{ disabled: !playing }}
                      disabled={!playing}
                      onPress={() => onTap(i, dir)}
                      style={({ pressed }) => [
                        styles.tile,
                        { width: cell, height: cell, backgroundColor: i === blocked ? CORAL : PURPLE },
                        pressed && playing && { opacity: 0.82 },
                      ]}
                    >
                      <Text style={[styles.glyph, { fontSize: Math.max(16, cell * 0.46), lineHeight: Math.max(18, cell * 0.5) }]}>
                        {DIR_GLYPH[dir]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {fly ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <FlyingArrow key={fly.key} fly={fly} onDone={() => setFly(null)} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {compact ? null : (
        <Text style={styles.hint}>
          {blocked >= 0 ? "Blocked — +1s on the clock." : "Tap an arrow with a clear path. Blocked = +1s."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LAVENDER, paddingHorizontal: 20 },
  rootCompact: { paddingHorizontal: 0, backgroundColor: "transparent" },
  pills: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, paddingTop: 8 },
  pillsCompact: { gap: 6, paddingTop: 0 },
  pill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
  },
  pillLabel: { color: INK, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  pillValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: INK },
  track: { height: 8, borderRadius: 4, backgroundColor: TRACK, marginTop: 14, marginHorizontal: 8, overflow: "hidden" },
  trackCompact: { marginTop: 8, marginHorizontal: 0, height: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: PURPLE },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 0 },
  board: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#1A1333",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  boardCompact: { borderRadius: 16, elevation: 0, shadowOpacity: 0 },
  row: { flexDirection: "row" },
  tile: { borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PURPLE },
  flyer: { position: "absolute", zIndex: 2 },
  empty: { borderRadius: 16, backgroundColor: EMPTY },
  glyph: { color: "#FFFFFF", fontFamily: fonts.bodyBold },
  hint: { textAlign: "center", color: MUTED, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, paddingBottom: 16 },
});
