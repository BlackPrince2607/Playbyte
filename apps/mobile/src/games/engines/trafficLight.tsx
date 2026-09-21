import React, { useEffect, useState } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";

/** Finite: one reaction tap. */
export function TrafficLight({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const [phase, setPhase] = useState<"red" | "green">("red");
  const [at, setAt] = useState(0);
  const [score, setScore] = useState(0);
  const glow = useSharedValue(0.4);

  useEffect(() => {
    const t = setTimeout(() => {
      setPhase("green");
      setAt(Date.now());
      glow.value = withSpring(1);
    }, 800 + Math.random() * 1800);
    return () => clearTimeout(t);
  }, [glow]);

  const lightStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
    shadowOpacity: glow.value,
  }));

  return (
    <Shell
      tag={configTag(config, "ARCADE")}
      title={title}
      score={score}
      subtitle="Tap when it turns green"
      onEnd={() => finish(score)}
    >
      <Animated.View
        style={[
          {
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: phase === "green" ? colors.lime : "#93000a",
            marginVertical: spacing.xl,
            alignSelf: "center",
          },
          lightStyle,
        ]}
      />
      <PrimaryButton
        label="Tap"
        onPress={() => {
          if (phase !== "green") {
            finish(0);
            return;
          }
          const ms = Date.now() - at;
          const s = Math.max(0, 1000 - ms);
          setScore(s);
          finish(s);
        }}
      />
    </Shell>
  );
}
