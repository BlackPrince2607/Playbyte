import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { prefersReducedMotion } from "../game/ui/feedback";
import { useLanguage } from "../context/LanguageContext";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  onDismiss: () => void;
};

/**
 * First-run coach mark for the feed. Touches pass through everything except "Got it",
 * so the player can learn by actually swiping.
 */
export function SwipeHintOverlay({ onDismiss }: Props) {
  const { t, fonts: ui } = useLanguage();
  const lift = useSharedValue(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    lift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 350 }),
      ),
      -1,
    );
  }, [lift]);

  const handStyle = useAnimatedStyle(() => ({
    opacity: 1 - lift.value * 0.8,
    transform: [{ translateY: -56 * lift.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(21,14,43,0.75)", "rgba(21,14,43,0.96)"]}
        locations={[0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" style={styles.content}>
        <View pointerEvents="none" style={styles.copy}>
          <View style={styles.track}>
            <Animated.View style={[styles.hand, handStyle]}>
              <Ionicons name="chevron-up" size={22} color={colors.ink} />
            </Animated.View>
          </View>
          <Text style={[type.gameQuestion, styles.title, { fontFamily: ui.display }]}>{t("swipeUp")}</Text>
          <Text style={[type.bodySm, styles.body, { fontFamily: ui.body }]}>{t("swipeBody")}</Text>
        </View>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t("gotItA11y")}
          hitSlop={8}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
        >
          <Text style={[styles.buttonText, { fontFamily: ui.bodyBold }]}>{t("gotIt")}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    position: "absolute",
    left: spacing.margin,
    right: spacing.margin,
    bottom: spacing.xl,
    alignItems: "center",
  },
  copy: { alignItems: "center" },
  track: {
    width: 52,
    height: 108,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(198,255,61,0.35)",
    backgroundColor: "rgba(198,255,61,0.08)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
    marginBottom: spacing.md,
  },
  hand: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.paper, fontSize: 26, lineHeight: 30, textAlign: "center" },
  body: { color: colors.lilac, textAlign: "center", marginTop: spacing.xs, maxWidth: 280 },
  button: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardAlt,
  },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.paper },
});
