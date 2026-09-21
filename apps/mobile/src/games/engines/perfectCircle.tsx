import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

function scoreCircle(points: { x: number; y: number }[]): number {
  if (points.length < 12) return 0;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
  if (mean < 20) return 5;
  const variance = radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length;
  const cv = Math.sqrt(variance) / mean;
  const first = points[0];
  const last = points[points.length - 1];
  const closure = Math.hypot(first.x - last.x, first.y - last.y) / mean;
  const roundness = Math.max(0, 1 - cv * 2.5);
  const closed = Math.max(0, 1 - closure);
  return Math.round(Math.min(100, (roundness * 0.7 + closed * 0.3) * 100));
}

/** Finite: draw once, lift to score. */
export function PerfectCircle({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const [path, setPath] = useState(() => Skia.Path.Make());
  const [score, setScore] = useState(0);
  const points = useRef<{ x: number; y: number }[]>([]);
  const doneStroke = useRef(false);

  const rebuildPath = (pts: { x: number; y: number }[]) => {
    const p = Skia.Path.Make();
    if (!pts.length) return p;
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    return p;
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      if (doneStroke.current) return;
      points.current = [{ x: e.x, y: e.y }];
      setPath(rebuildPath(points.current));
    })
    .onUpdate((e) => {
      if (doneStroke.current) return;
      points.current.push({ x: e.x, y: e.y });
      setPath(rebuildPath(points.current));
    })
    .onEnd(() => {
      if (doneStroke.current) return;
      doneStroke.current = true;
      const s = scoreCircle(points.current);
      setScore(s);
      finish(s);
    })
    .runOnJS(true);

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle="Draw the roundest circle — lift to score"
      onEnd={() => finish(score)}
    >
      <Text style={[type.bodySm, { color: colors.lilac, marginBottom: spacing.md }]}>
        One stroke. Lift when done.
      </Text>
      <GestureDetector gesture={pan}>
        <View
          style={{
            height: 280,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.cardAlt,
            overflow: "hidden",
          }}
        >
          <Canvas style={{ flex: 1 }}>
            <Path path={path} color={colors.lime} style="stroke" strokeWidth={4} strokeCap="round" />
          </Canvas>
        </View>
      </GestureDetector>
    </Shell>
  );
}
