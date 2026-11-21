import React, { useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import type { EngineViewProps } from "../../../ui/types";
import { useClock } from "../../../ui/useClock";
import type { LaneDashAction, LaneDashState } from "../logic/engine";

type Size = { w: number; h: number };

function laneX(lane: number, w: number) {
  const laneW = w / 3;
  return lane * laneW + laneW / 2;
}

export function LaneDashView({ state, dispatch, snapshot, now }: EngineViewProps<LaneDashState, LaneDashAction>) {
  const playing = snapshot.status === "playing";
  const t = useClock(now, playing, 50);
  const sizeRef = useRef<Size>({ w: 0, h: 0 });
  const [size, setSize] = React.useState<Size>({ w: 0, h: 0 });
  const playerX = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const reduced = prefersReducedMotion();
  const laneRef = useRef(state.playerLane);
  laneRef.current = state.playerLane;

  useEffect(() => {
    if (!size.w) return;
    const x = laneX(state.playerLane, size.w);
    playerX.value = reduced ? x : withSpring(x, { damping: 16, stiffness: 220 });
  }, [state.playerLane, size.w, reduced, playerX]);

  useEffect(() => {
    if (state.crashes <= 0) return;
    feedback("error");
    if (!reduced) {
      shakeX.value = withTiming(8, { duration: 40 }, () => {
        shakeX.value = withTiming(-8, { duration: 40 }, () => {
          shakeX.value = withTiming(0, { duration: 40 });
        });
      });
    }
  }, [state.crashes, reduced, shakeX]);

  const moveTo = (lane: 0 | 1 | 2) => {
    if (!playing || state.roundOver) return;
    feedback("tap");
    dispatch({ type: "lane", lane });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const next = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
    sizeRef.current = next;
    setSize(next);
    playerX.value = laneX(state.playerLane, next.w);
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .runOnJS(true)
        .onEnd((e) => {
          if (Math.abs(e.translationX) < 24) return;
          const cur = laneRef.current;
          const next = (e.translationX < 0 ? Math.max(0, cur - 1) : Math.min(2, cur + 1)) as 0 | 1 | 2;
          moveTo(next);
        }),
    [playing, state.roundOver],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((e) => {
          const w = sizeRef.current.w;
          if (!w) return;
          const lane = Math.max(0, Math.min(2, Math.floor(e.x / (w / 3)))) as 0 | 1 | 2;
          moveTo(lane);
        }),
    [playing, state.roundOver],
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pan, tap), [pan, tap]);

  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: playerX.value - 22 + shakeX.value }],
  }));

  const showNear = state.nearMissFlashUntil > t;
  const showCrash = state.flashUntil > t;
  const invuln = state.invulnUntil > t;

  return (
    <View style={styles.root}>
      <Text style={[type.bodySm, styles.hint]}>Swipe or tap a lane</Text>
      <GestureDetector gesture={gesture}>
        <View style={styles.field} onLayout={onLayout} accessibilityLabel="Lane dash playfield">
          <View style={styles.road}>
            <View style={[styles.edge, { left: "33.33%" }]} />
            <View style={[styles.edge, { left: "66.66%" }]} />
            <View style={styles.horizon} />
            {size.h
              ? [0.2, 0.45, 0.7].map((p) => (
                  <View
                    key={p}
                    style={[
                      styles.speedLine,
                      {
                        top: size.h * p,
                        opacity: 0.12 + state.speedScale * 0.08,
                      },
                    ]}
                  />
                ))
              : null}

            {state.obstacles.map((o) => {
              const laneW = size.w / 3 || 1;
              const depth = 0.35 + o.y * 0.65;
              const w = (o.kind === "wide" ? laneW * 0.72 : laneW * 0.55) * depth;
              const h = 14 * depth;
              const x = laneX(o.lane, size.w) - w / 2;
              const y = o.y * (size.h * 0.78);
              return (
                <View
                  key={o.id}
                  pointerEvents="none"
                  style={[
                    styles.obstacle,
                    {
                      left: x,
                      top: y,
                      width: w,
                      height: h,
                      borderRadius: h / 2,
                      opacity: 0.55 + o.y * 0.45,
                    },
                  ]}
                />
              );
            })}

            {size.w ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.player,
                  playerStyle,
                  {
                    bottom: size.h * 0.1,
                    opacity: invuln ? 0.55 : 1,
                  },
                ]}
              >
                <View style={styles.playerGlow} />
                <View style={styles.playerCore} />
              </Animated.View>
            ) : null}
          </View>

          <View style={styles.laneRow} pointerEvents="none">
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.laneTint, state.playerLane === i && styles.laneActive]} />
            ))}
          </View>

          {showNear ? (
            <Animated.Text entering={FadeIn.duration(80)} exiting={FadeOut.duration(120)} style={styles.nearLabel}>
              NICE
            </Animated.Text>
          ) : null}
          {showCrash ? (
            <Animated.View entering={FadeIn.duration(60)} style={styles.crashFlash} pointerEvents="none" />
          ) : null}
        </View>
      </GestureDetector>
      <Text style={[type.micro, styles.meta]}>
        {Math.floor(state.distance)}m · {state.nearMisses} near-miss
        {state.nearMisses === 1 ? "" : "es"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.margin, gap: spacing.sm },
  hint: { color: colors.lilac, textAlign: "center" },
  field: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#120A24",
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.35)",
  },
  road: { flex: 1 },
  edge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(245, 240, 255, 0.18)",
  },
  horizon: {
    position: "absolute",
    top: "8%",
    left: "20%",
    right: "20%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(198, 255, 61, 0.25)",
  },
  speedLine: {
    position: "absolute",
    left: "10%",
    right: "10%",
    height: 1,
    backgroundColor: colors.paper,
  },
  obstacle: {
    position: "absolute",
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  player: {
    position: "absolute",
    width: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  playerGlow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(198, 255, 61, 0.22)",
  },
  playerCore: {
    width: 28,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: "rgba(245, 240, 255, 0.5)",
  },
  laneRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
  },
  laneTint: { flex: 1 },
  laneActive: { backgroundColor: "rgba(198, 255, 61, 0.05)" },
  nearLabel: {
    position: "absolute",
    top: "42%",
    alignSelf: "center",
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.lime,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    letterSpacing: 2,
  },
  crashFlash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 77, 141, 0.28)",
  },
  meta: { color: colors.lilac, textAlign: "center", marginBottom: spacing.sm },
});
