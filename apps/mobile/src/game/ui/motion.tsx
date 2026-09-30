/**
 * Reusable animation primitives for every engine UI. All run on the UI thread via Reanimated and
 * respect the system reduce-motion setting.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, radius } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { prefersReducedMotion } from "./feedback";

/** Springy scale pop whenever `trigger` changes (score ticks, correct answers). */
export function usePop(trigger: unknown, amount = 1.18) {
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    scale.value = withSequence(withTiming(amount, { duration: 90 }), withSpring(1, { damping: 12 }));
  }, [trigger, amount, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/** Horizontal shake whenever `trigger` changes (wrong answers). */
export function useShake(trigger: unknown) {
  const x = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    x.value = withSequence(
      withTiming(-10, { duration: 45 }),
      withTiming(10, { duration: 45 }),
      withTiming(-6, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
  }, [trigger, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

/** Full-bleed color flash keyed by `seq` (answer feedback). */
export function FlashOverlay({ seq, color }: { seq: number | undefined; color: string }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!seq) return;
    opacity.value = withSequence(withTiming(prefersReducedMotion() ? 0.12 : 0.28, { duration: 70 }), withTiming(0, { duration: 260 }));
  }, [seq, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

/** 3-2-1 countdown overlay; calls onDone once. */
export function Countdown({ from = 3, onDone }: { from?: number; onDone: () => void }) {
  const [n, setN] = useState(from);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (n <= 0) {
      done.current();
      return;
    }
    const t = setTimeout(() => setN((x) => x - 1), prefersReducedMotion() ? 350 : 600);
    return () => clearTimeout(t);
  }, [n]);
  const pop = usePop(n, 1.4);
  if (n <= 0) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "rgba(21,14,43,0.82)" }]} accessibilityLiveRegion="polite">
      <Animated.Text style={[type.largeScore, { color: colors.lime }, pop]}>{n}</Animated.Text>
    </View>
  );
}

/** Streak / combo badge; hidden below 3. */
export function StreakBadge({ streak }: { streak: number }) {
  const pop = usePop(streak, 1.3);
  if (streak < 3) return null;
  return (
    <Animated.View style={[styles.streak, pop]} accessibilityLabel={`Streak ${streak}`}>
      <Text style={[type.micro, { color: colors.ink, fontFamily: fonts.bodyBold }]}>🔥 {streak}</Text>
    </Animated.View>
  );
}

/** Linear countdown bar driven by a session-clock deadline; freezes while paused. */
export function TimerBar({ deadline, now, paused }: { deadline?: number; now: () => number; paused: boolean }) {
  const progress = useSharedValue(1);
  const total = useRef(1);
  const lastDeadline = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (deadline === undefined) return;
    const remaining = Math.max(0, deadline - now());
    if (deadline !== lastDeadline.current) {
      total.current = Math.max(1, remaining);
      lastDeadline.current = deadline;
    }
    cancelAnimation(progress);
    progress.value = remaining / total.current;
    if (!paused) progress.value = withTiming(0, { duration: remaining, easing: Easing.linear });
  }, [deadline, paused, now, progress]);
  const style = useAnimatedStyle(() => ({
    width: `${Math.max(0, progress.value) * 100}%`,
    backgroundColor: progress.value < 0.25 ? colors.pink : colors.lime,
  }));
  if (deadline === undefined) return null;
  return (
    <View style={styles.timerTrack} accessibilityRole="progressbar" accessibilityLabel="Time remaining">
      <Animated.View style={[styles.timerFill, style]} />
    </View>
  );
}

const CONFETTI_COLORS = [colors.lime, colors.pink, colors.pinkSoft, colors.lilac, "#FFB020"];

function Particle({ index, seed }: { index: number; seed: number }) {
  const r = (k: number) => {
    const x = Math.sin((index + 1) * 9301 + seed * 49297 + k * 233) * 10000;
    return x - Math.floor(x);
  };
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    y.value = withDelay(r(1) * 150, withTiming(1, { duration: 900 + r(2) * 500, easing: Easing.out(Easing.quad) }));
    o.value = withDelay(700, withTiming(0, { duration: 600 }));
  }, [o, y]);
  const dx = (r(3) - 0.5) * 320;
  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateX: dx * y.value }, { translateY: -40 + y.value * (260 + r(4) * 200) }, { rotate: `${y.value * 540 * (r(5) - 0.5)}deg` }],
  }));
  return <Animated.View style={[styles.particle, { backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length] }, style]} />;
}

/** Lightweight celebration burst (24 views, no extra dependency). */
export function Confetti({ active, count = 24 }: { active: boolean; count?: number }) {
  const seed = useMemo(() => (active ? Date.now() % 1000 : 0), [active]);
  if (!active || prefersReducedMotion()) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center" }]}>
      {Array.from({ length: count }, (_, i) => (
        <Particle key={`${seed}-${i}`} index={i} seed={seed} />
      ))}
    </View>
  );
}

/** Animated wrapper that pops on `trigger` change. */
export function Pop({ trigger, style, children }: { trigger: unknown; style?: ViewStyle; children: React.ReactNode }) {
  const pop = usePop(trigger);
  return <Animated.View style={[style, pop]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  streak: { backgroundColor: colors.lime, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  timerTrack: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: "hidden" },
  timerFill: { height: 6, borderRadius: 3 },
  particle: { position: "absolute", top: "35%", width: 8, height: 12, borderRadius: 2 },
});
