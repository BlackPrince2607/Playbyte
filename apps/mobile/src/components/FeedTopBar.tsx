import { useEffect, useRef } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "./AvatarImage";
import { CoinIcon } from "./CoinIcon";
import { MajaLogo } from "./MajaLogo";
import { useApp } from "../context/AppContext";
import { useLanguage } from "../context/LanguageContext";
import { prefersReducedMotion } from "../game/ui/feedback";
import { fill } from "../i18n/strings";
import { shareAppInvite } from "../lib/shareInvite";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  streak?: number;
  coins?: number;
  variant?: "feed" | "compete";
  onStreak?: () => void;
  onCoins?: () => void;
  onProfile?: () => void;
  avatarDisplayName?: string;
  avatarKey?: string | null;
};

export function FeedTopBar({
  streak = 0,
  coins = 0,
  variant = "feed",
  onStreak,
  onCoins,
  onProfile,
  avatarDisplayName,
  avatarKey,
}: Props) {
  const insets = useSafeAreaInsets();
  const { me, coinCredit } = useApp();
  const { t } = useLanguage();
  const name = avatarDisplayName ?? me?.displayName ?? "You";
  const photo = avatarKey ?? me?.avatarKey ?? null;
  const avatarSize = variant === "compete" ? 32 : 40;
  const prevCoins = useRef(coins);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    const grew = coins > prevCoins.current;
    prevCoins.current = coins;
    if (!grew || prefersReducedMotion()) return;
    scale.value = withSequence(withTiming(1.16, { duration: 120 }), withSpring(1, { damping: 10 }));
    glow.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 700 }));
  }, [coins, coinCredit?.id, glow, scale]);

  const coinChipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: glow.value > 0.05 ? colors.lime : colors.line,
    backgroundColor: glow.value > 0.05 ? "rgba(198, 255, 92, 0.16)" : colors.cardAlt,
  }));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.inner}>
        <Pressable onPress={onProfile} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open profile">
          <AvatarImage displayName={name} avatarKey={photo} size={avatarSize} />
        </Pressable>
        <MajaLogo />
        {variant === "feed" ? (
          <View style={styles.stats}>
            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              onPress={onCoins}
              disabled={!onCoins}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={fill(t("coinsA11y"), { count: coins })}
            >
              <Animated.View style={[styles.streak, coinChipStyle]}>
                <Text style={[type.statsSm, { color: colors.lime }]}>{coins}</Text>
                <CoinIcon size={16} />
              </Animated.View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.streak, pressed && { opacity: 0.7 }]}
              onPress={onStreak}
              disabled={!onStreak}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Streak ${streak}. Open streak details`}
            >
              <Text style={[type.statsSm, { color: colors.pink }]}>{streak}</Text>
              <Text style={{ fontSize: 14 }}>🔥</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.share, pressed && { opacity: 0.7 }]}
            onPress={() => void shareAppInvite(undefined, "compete_top_bar")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Share Maja"
          >
            <Ionicons name="share-outline" size={18} color={colors.pinkSoft} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.md,
    backgroundColor: "transparent",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stats: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  share: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardAlt,
  },
});
