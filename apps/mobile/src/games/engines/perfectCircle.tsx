import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { Shell } from "../Shell";
import { scoreCircle } from "../logic/scoring";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

export { scoreCircle } from "../logic/scoring";

/** Finite: draw once, lift to score. Short accidental strokes reset. */
export function PerfectCircle({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
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
    .enabled(!done)
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
      if (points.current.length < 12) {
        points.current = [];
        setPath(Skia.Path.Make());
        return;
      }
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
