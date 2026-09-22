import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Obstacle = { id: number; lane: number; y: number };

/** Endless: 3-lane dodge; crash restarts run; best score until End. */
export function LaneDash({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const [lane, setLane] = useState(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [runScore, setRunScore] = useState(0);
  const [best, setBest] = useState(0);
  const [alive, setAlive] = useState(true);
  const idRef = useRef(0);
  const laneRef = useRef(lane);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  laneRef.current = lane;

  useEffect(() => {
    return () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!alive || done) return;
    const tick = setInterval(() => {
      setRunScore((s) => {
        const next = s + 1;
        setBest((b) => Math.max(b, next));
        return next;
      });
      setObstacles((prev) => {
        let next = prev
          .map((o) => ({ ...o, y: o.y + 18 }))
          .filter((o) => o.y < 320);
        if (Math.random() < 0.22) {
          idRef.current += 1;
          next = [...next, { id: idRef.current, lane: Math.floor(Math.random() * 3), y: -40 }];
        }
        const hit = next.some((o) => o.lane === laneRef.current && o.y > 200 && o.y < 260);
        if (hit) {
          setAlive(false);
          setRunScore(0);
          if (restartTimer.current) clearTimeout(restartTimer.current);
          restartTimer.current = setTimeout(() => {
            setObstacles([]);
            setAlive(true);
          }, 700);
          return [];
        }
        return next;
      });
    }, 80);
    return () => clearInterval(tick);
  }, [alive, done]);

  return (
    <Shell
      tag={configTag(config, "ARCADE")}
      title={title}
      score={best}
      subtitle={`Run ${runScore} · tap lanes to dodge`}
      onEnd={() => finish(best)}
    >
      <View
        style={{
          height: 300,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.cardAlt,
          overflow: "hidden",
          flexDirection: "row",
        }}
      >
        {[0, 1, 2].map((l) => (
          <Pressable
            key={l}
            disabled={done || !alive}
            onPress={() => setLane(l)}
            style={{
              flex: 1,
              borderRightWidth: l < 2 ? 1 : 0,
              borderRightColor: colors.line,
              backgroundColor: lane === l ? "rgba(198,255,61,0.08)" : "transparent",
            }}
          >
            {obstacles
              .filter((o) => o.lane === l)
              .map((o) => (
                <View
                  key={o.id}
                  style={{
                    position: "absolute",
                    top: o.y,
                    alignSelf: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: colors.pink,
                  }}
                />
              ))}
            {lane === l ? (
              <View
                style={{
                  position: "absolute",
                  bottom: 24,
                  alignSelf: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.lime,
                }}
              />
            ) : null}
          </Pressable>
        ))}
      </View>
      {!alive ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.sm, fontFamily: fonts.bodyBold }]}>
          Crash! New run…
        </Text>
      ) : null}
    </Shell>
  );
}
