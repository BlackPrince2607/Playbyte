import { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { prefersReducedMotion } from "../game/ui/feedback";
import { colors } from "../theme/colors";
import { type } from "../theme/typography";

const WORDMARK = require("../../assets/maja-wordmark.png");
/** Width / height of the wordmark artwork. */
const WORDMARK_RATIO = 480 / 215;
const HEIGHTS = { sm: 22, md: 30, lg: 48 } as const;

/** The light wordmark, drawn for the app's dark surfaces. */
export function MajaLogo({ size = "md" }: { size?: keyof typeof HEIGHTS }) {
  const height = HEIGHTS[size];
  return (
    <Image
      source={WORDMARK}
      style={{ height, width: height * WORDMARK_RATIO }}
      resizeMode="contain"
      accessibilityRole="header"
      accessibilityLabel="Maja"
    />
  );
}

export function LivePill({ count, label }: { count?: number; label?: string }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    pulse.value = withRepeat(
      withSequence(withTiming(0.45, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false,
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.85 + pulse.value * 0.15 }],
  }));

  return (
    <View style={styles.pill}>
      <Animated.View style={[styles.dot, dotStyle]} />
      <Text style={[type.statsSm, { color: colors.lime, fontSize: 10, letterSpacing: 0.8 }]}>
        {label ?? (count !== undefined ? `${count} PLAYING NOW` : "LIVE")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(198, 255, 61, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
});
