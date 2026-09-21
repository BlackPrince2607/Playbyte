import React, { useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Endless streak — miss resets streak; End anytime. */
export function HigherOrLower({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const [n, setN] = useState(() => 1 + Math.floor(Math.random() * 50));
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  function guess(higher: boolean) {
    const next = 1 + Math.floor(Math.random() * 50);
    const ok = higher ? next >= n : next <= n;
    if (!ok) {
      setStreak(0);
      setN(next);
      return;
    }
    flash.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 200 }));
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    setBest((b) => Math.max(b, nextStreak));
    setN(next);
  }

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={best}
      subtitle={`Streak ${streak} · best counts`}
      onEnd={() => finish(best)}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 100,
            backgroundColor: colors.lime,
          },
          flashStyle,
        ]}
        pointerEvents="none"
      />
      <Text style={[type.largeScore, { color: colors.paper, marginVertical: spacing.lg }]}>{n}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: spacing.lg }}>
        <GameBtn label="Lower" onPress={() => guess(false)} />
        <GameBtn label="Higher" onPress={() => guess(true)} />
      </View>
    </Shell>
  );
}
