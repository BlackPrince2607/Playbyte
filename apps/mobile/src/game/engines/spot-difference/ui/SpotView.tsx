import { Canvas, Circle, Fill, Group, Oval, Path, RoundedRect, vec } from "@shopify/react-native-skia";
import React, { memo, useEffect, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import { HintBar } from "../../../ui/kit";
import type { EngineViewProps } from "../../../ui/types";
import type { Difference } from "../logic/differences";
import type { SpotAction, SpotState } from "../logic/engine";
import { ASPECT, Scene, Shape } from "../logic/scene";

const GOLD = "#FFD84D";

function starPath(cx: number, cy: number, r: number) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? "M" : "L"}${cx + Math.cos(a) * rr} ${cy + Math.sin(a) * rr} `;
  }
  return `${d}Z`;
}

const RENDER: Record<Shape["kind"], (s: Shape, cx: number, cy: number, hw: number, hh: number) => React.ReactElement> = {
  circle: (s, cx, cy, hw) => <Circle cx={cx} cy={cy} r={hw} color={s.color} />,
  rect: (s, cx, cy, hw, hh) => <RoundedRect x={cx - hw} y={cy - hh} width={hw * 2} height={hh * 2} r={Math.min(hw, hh) * 0.25} color={s.color} />,
  ring: (s, cx, cy, hw, hh) => <Oval x={cx - hw} y={cy - hh} width={hw * 2} height={hh * 2} color={s.color} style="stroke" strokeWidth={Math.max(1.5, hh * 0.3)} />,
  tri: (s, cx, cy, hw, hh) => <Path path={`M${cx} ${cy - hh} L${cx + hw} ${cy + hh} L${cx - hw} ${cy + hh} Z`} color={s.color} />,
  diamond: (s, cx, cy, hw, hh) => <Path path={`M${cx} ${cy - hh} L${cx + hw} ${cy} L${cx} ${cy + hh} L${cx - hw} ${cy} Z`} color={s.color} />,
  star: (s, cx, cy, hw) => <Path path={starPath(cx, cy, hw)} color={s.color} />,
};

const SceneCanvas = memo(function SceneCanvas({ scene, width }: { scene: Scene; width: number }) {
  const k = width;
  return (
    <Canvas style={{ width, height: width * ASPECT }} pointerEvents="none">
      <Fill color={scene.bg} />
      {scene.shapes.map((s) => {
        const cx = s.x * k;
        const cy = s.y * k;
        const node = RENDER[s.kind](s, cx, cy, s.hw * k, s.hh * k);
        return s.rot ? (
          <Group key={s.id} transform={[{ rotate: (s.rot * Math.PI) / 180 }]} origin={vec(cx, cy)}>
            {node}
          </Group>
        ) : (
          <React.Fragment key={s.id}>{node}</React.Fragment>
        );
      })}
    </Canvas>
  );
});

function Marker({ d, width, color, pulse, grow = 1 }: { d: Difference; width: number; color: string; pulse?: boolean; grow?: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (pulse && !prefersReducedMotion()) o.value = withRepeat(withTiming(0.3, { duration: 600 }), -1, true);
  }, [pulse, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  const w = d.hw * width * grow;
  const h = d.hh * width * grow;
  return (
    <Animated.View
      pointerEvents="none"
      entering={prefersReducedMotion() ? undefined : ZoomIn.duration(220)}
      style={[
        { position: "absolute", left: d.x * width - w, top: d.y * width - h, width: w * 2, height: h * 2, borderRadius: Math.min(w, h), borderWidth: 3, borderColor: color },
        style,
      ]}
    />
  );
}

function Picture({
  scene,
  width,
  label,
  state,
  onTap,
  enabled,
}: {
  scene: Scene;
  width: number;
  label: string;
  state: SpotState;
  onTap: (x: number, y: number) => void;
  enabled: boolean;
}) {
  const handle = (e: GestureResponderEvent) => {
    if (!enabled) return;
    onTap(e.nativeEvent.locationX / width, e.nativeEvent.locationY / width);
  };
  const miss = state.lastTap && !state.lastTap.ok ? state.lastTap : null;
  return (
    <Pressable
      onPress={handle}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Picture ${label}. ${state.found.length} of ${state.diffs.length} differences found.`}
      accessibilityHint="Tap where this picture differs from the other one. Hints mark a difference for you."
      style={[styles.picture, { width, height: width * ASPECT }]}
    >
      <SceneCanvas scene={scene} width={width} />
      {state.diffs.map((d) =>
        state.found.includes(d.id) ? (
          <Marker key={d.id} d={d} width={width} color={colors.lime} />
        ) : state.roundOver ? (
          <Marker key={d.id} d={d} width={width} color={colors.pink} />
        ) : state.revealed.includes(d.id) ? (
          <Marker key={d.id} d={d} grow={1.6} width={width} color={GOLD} pulse />
        ) : null,
      )}
      {miss ? (
        <Animated.Text key={miss.n} entering={FadeIn.duration(80)} pointerEvents="none" style={[styles.miss, { left: miss.x * width - 12, top: miss.y * width - 16 }]}>
          ✕
        </Animated.Text>
      ) : null}
      <View pointerEvents="none" style={styles.badge}>
        <Text style={[type.metadata, { color: colors.ink, fontFamily: fonts.bodyBold }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function SpotView({ state, dispatch, requestHint, snapshot }: EngineViewProps<SpotState, SpotAction>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const width = Math.floor(Math.min(box.w, Math.max(0, box.h - spacing.sm) / (2 * ASPECT)));
  const playing = snapshot.status === "playing";

  const foundN = state.found.length;
  useEffect(() => {
    if (foundN) feedback("success");
  }, [foundN]);
  const missN = state.lastTap && !state.lastTap.ok ? state.lastTap.n : 0;
  useEffect(() => {
    if (missN) feedback("error");
  }, [missN]);

  const tap = (x: number, y: number) => dispatch({ type: "tap", x, y });

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.margin, gap: spacing.sm }}>
      <View style={styles.header}>
        <Text style={[type.bodySm, { color: colors.lilac }]}>Tap the differences on either picture</Text>
        <View style={styles.dots} accessibilityLabel={`${foundN} of ${state.diffs.length} found`}>
          {state.diffs.map((d, i) => (
            <View key={d.id} style={[styles.dot, i < foundN && { backgroundColor: colors.lime, borderColor: colors.lime }]} />
          ))}
        </View>
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: spacing.sm }} onLayout={onLayout}>
        {width > 0 ? (
          <>
            <Picture scene={state.left} width={width} label="A" state={state} onTap={tap} enabled={playing} />
            <Picture scene={state.right} width={width} label="B" state={state} onTap={tap} enabled={playing} />
          </>
        ) : null}
      </View>
      <HintBar hints={snapshot.hints} onHint={requestHint} />
      {state.roundOver ? (
        <Text style={[type.bodyLg, { color: foundN >= state.diffs.length ? colors.lime : colors.pink, textAlign: "center" }]} accessibilityLiveRegion="polite">
          {foundN >= state.diffs.length ? "All spotted!" : `Missed ${state.diffs.length - foundN}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.lilac },
  picture: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  badge: { position: "absolute", top: 6, left: 6, backgroundColor: colors.paper, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  miss: { position: "absolute", color: colors.pink, fontSize: 26, fontWeight: "900" },
});
