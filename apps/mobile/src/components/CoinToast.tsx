import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CoinCredit } from "../lib/economy";
import { useLanguage } from "../context/LanguageContext";
import { fill, type StringKey } from "../i18n/strings";
import { prefersReducedMotion } from "../game/ui/feedback";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { CoinIcon } from "./CoinIcon";

const REASON_KEY: Record<CoinCredit["reason"], StringKey> = {
  game: "coinCreditGame",
  moment: "coinCreditPoll",
  streak: "coinCreditStreak",
  purchase: "coinCreditPurchase",
  reward: "coinCreditReward",
};

/** Floating credit chip shown whenever the wallet balance goes up. */
export function CoinToast({ credit }: { credit: CoinCredit | null }) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-12);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    if (!credit || credit.amount <= 0) {
      opacity.value = 0;
      return;
    }
    if (prefersReducedMotion()) {
      opacity.value = 1;
      translateY.value = 0;
      scale.value = 1;
      return;
    }
    opacity.value = 0;
    translateY.value = -16;
    scale.value = 0.9;
    opacity.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 1600 }),
      withTiming(0, { duration: 280, easing: Easing.in(Easing.cubic) }),
    );
    translateY.value = withSequence(
      withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 1600 }),
      withTiming(-10, { duration: 280 }),
    );
    scale.value = withSequence(
      withTiming(1.06, { duration: 180 }),
      withTiming(1, { duration: 160 }),
      withTiming(1, { duration: 1460 }),
      withTiming(0.96, { duration: 280 }),
    );
  }, [credit?.id, credit?.amount, opacity, scale, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  if (!credit || credit.amount <= 0) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 52 }]}>
      <Animated.View style={[styles.toast, style]} accessibilityLiveRegion="polite">
        <CoinIcon size={20} />
        <View style={styles.copy}>
          <Text style={[type.button, { color: colors.ink, fontFamily: ui.bodyBold }]}>
            {fill(t("coinToast"), { count: credit.amount })}
          </Text>
          <Text style={[type.micro, { color: colors.ink, opacity: 0.75, fontFamily: ui.bodyMedium }]}>
            {t(REASON_KEY[credit.reason])}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 120,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "88%",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  copy: { gap: 1 },
});
