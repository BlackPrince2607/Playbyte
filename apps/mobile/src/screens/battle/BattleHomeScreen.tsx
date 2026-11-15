import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatCount } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { FeedTopBar } from "../../components/FeedTopBar";
import { useApp } from "../../context/AppContext";
import { prefersReducedMotion } from "../../game/ui/feedback";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onPlayRandom: () => void;
  onChallengeFriend: () => void;
  onHistory?: () => void;
  onProfile?: () => void;
};

function LivePulse() {
  const p = useSharedValue(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    p.value = withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })),
      -1,
      false,
    );
  }, [p]);
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(p.value, [0, 1], [1, 2.1]) }],
  }));
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, ring]} />
      <View style={styles.liveDot} />
    </View>
  );
}

function MysteryFace() {
  return (
    <View style={styles.mysteryFace}>
      <Ionicons name="help" size={28} color={colors.lilac} />
    </View>
  );
}

export function BattleHomeScreen({ onPlayRandom, onChallengeFriend, onHistory, onProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { me, friends, wallet, streak } = useApp();
  const youName = me?.displayName ?? "You";
  const friendCount = friends.length;
  const reduced = prefersReducedMotion();

  return (
    <View style={styles.root}>
      <FeedTopBar
        variant="compete"
        streak={streak}
        coins={wallet?.balance ?? 0}
        onProfile={onProfile}
        avatarDisplayName={youName}
        avatarKey={me?.avatarKey}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 64 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.statusRow}>
          <View style={styles.liveRow}>
            <LivePulse />
            <Text style={[type.metadata, styles.liveLabel]}>Live Matchmaking</Text>
          </View>
          <View style={styles.countPill}>
            <Ionicons name="people" size={14} color={surface.lime} />
            <Text style={[type.metadata, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
              {friendCount > 0 ? `${formatCount(friendCount)} friends` : "Ready"}
            </Text>
          </View>
        </View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(280)} style={styles.card}>
          <View style={[styles.glow, styles.glowPink, { top: -32, right: -32 }]} />
          <View style={[styles.glow, styles.glowLime, { bottom: -32, left: -32 }]} />
          <View style={styles.vsRow}>
            <View style={[styles.ring, { transform: [{ rotate: "-6deg" }] }]}>
              <AvatarImage displayName={youName} avatarKey={me?.avatarKey} size={56} />
            </View>
            <View style={styles.vsBadge}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={[styles.ring, { transform: [{ rotate: "6deg" }] }]}>
              <MysteryFace />
            </View>
          </View>
          <Text style={[type.gameQuestion, styles.cardTitle]}>Random Player</Text>
          <Text style={[type.bodySm, styles.cardHint]}>Match instantly · new games included</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onPlayRandom();
            }}
            style={({ pressed }) => [styles.ctaPink, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
          >
            <Ionicons name="game-controller" size={22} color={colors.paper} />
            <Text style={[type.button, { color: colors.paper }]}>Play Now</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.delay(80).duration(280)} style={styles.card}>
          <View style={[styles.glow, styles.glowLime, { top: -20, right: -20 }]} />
          <View style={styles.vsRow}>
            <View style={styles.ring}>
              <AvatarImage displayName={youName} avatarKey={me?.avatarKey} size={56} />
            </View>
            <View style={styles.boltBadge}>
              <Ionicons name="flash" size={20} color={colors.ink} />
            </View>
            <View style={styles.ring}>
              <View style={styles.friendSlot}>
                <Ionicons name="people" size={26} color={colors.pinkSoft} />
              </View>
            </View>
          </View>
          <Text style={[type.gameQuestion, styles.cardTitle]}>Challenge Friend</Text>
          <Text style={[type.bodySm, styles.cardHint]}>Pick someone from your friends list</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChallengeFriend();
            }}
            style={({ pressed }) => [styles.ctaLime, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
          >
            <Ionicons name="send" size={20} color={colors.ink} />
            <Text style={[type.button, { color: colors.ink }]}>Challenge</Text>
          </Pressable>
        </Animated.View>

        {onHistory ? (
          <Pressable
            accessibilityRole="button"
            onPress={onHistory}
            style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="time-outline" size={18} color={colors.lilac} />
            <Text style={[type.bodySm, { color: colors.lilac, fontFamily: fonts.bodyMedium }]}>
              Battle History{me?.displayName ? ` · ${me.displayName}` : ""}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.lilac} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  scroll: {
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDotWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  liveDotRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: surface.lime,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: surface.lime,
  },
  liveLabel: {
    color: colors.lilac,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontFamily: fonts.bodyMedium,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing.md + 4,
    minHeight: 230,
    overflow: "hidden",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  glow: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  glowPink: { backgroundColor: "rgba(255,77,141,0.2)" },
  glowLime: { backgroundColor: "rgba(189,245,50,0.15)" },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.sm,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 4,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  mysteryFace: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  friendSlot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.pinkFill,
    alignItems: "center",
    justifyContent: "center",
  },
  vsBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -10,
    zIndex: 2,
  },
  vsText: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: surface.lime,
    fontStyle: "italic",
  },
  boltBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: surface.limeDeep,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
    zIndex: 2,
  },
  cardTitle: {
    color: colors.paper,
    textAlign: "center",
    marginBottom: 0,
  },
  cardHint: {
    color: colors.lilac,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  ctaPink: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.pink,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaLime: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: surface.lime,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: surface.lime,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  historyBtn: {
    alignSelf: "center",
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(42,27,78,0.4)",
  },
});
