import React, { useState } from "react";
import { Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Endless: tap freely; End anytime (no forced timer exit). */
export function FrenzyTap({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const [count, setCount] = useState(0);
  const scale = useSharedValue(1);
  const tapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const maxScore = typeof config?.maxScore === "number" ? config.maxScore : 2000;

  return (
    <Shell
      tag={configTag(config, "ARCADE")}
      title={title}
      score={count}
      subtitle="Tap as much as you want — End when ready"
      onEnd={() => finish(count)}
    >
      <Text style={[type.largeScore, { color: colors.paper }]}>{count}</Text>
      <Animated.View style={[{ marginTop: spacing.xl }, tapStyle]}>
        <PrimaryButton
          label="TAP"
          disabled={done}
          onPress={() => {
            if (done) return;
            scale.value = withSequence(withTiming(0.9, { duration: 40 }), withSpring(1));
            setCount((c) => Math.min(c + 1, maxScore));
          }}
        />
      </Animated.View>
    </Shell>
  );
}
