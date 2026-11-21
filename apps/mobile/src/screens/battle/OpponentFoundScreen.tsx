import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OnlineMatch } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { CloseButton } from "../../components/CloseButton";
import { useApp } from "../../context/AppContext";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

export type DuelPreview = {
  opponent: { displayName: string; avatarKey: string | null };
  gameTitle?: string;
  countdownSeconds?: number;
  badgeLabel?: string;
};

type Props = {
  /** Online quick-match payload. Prefer this when available. */
  match?: OnlineMatch | null;
  /** Friend challenge / synthetic duel when there is no OnlineMatch. */
  duel?: DuelPreview | null;
  onClose: () => void;
  onReady: () => void;
  onProfile?: () => void;
  /** When false, countdown waits at GO until the game card is warmed. */
  gameReady?: boolean;
  launchError?: string;
};

export function OpponentFoundScreen({
  match,
  duel,
  onClose,
  onReady,
  onProfile,
  gameReady = true,
  launchError,
}: Props) {
  const insets = useSafeAreaInsets();
  const { me } = useApp();
  const preview: DuelPreview = duel ?? {
    opponent: {
      displayName: match?.opponent?.displayName ?? "Rival",
      avatarKey: match?.opponent?.avatarKey ?? null,
    },
    gameTitle: match?.gameTitle,
    countdownSeconds: match?.countdownSeconds,
  };
  const initial = Math.max(1, Math.min(5, preview.countdownSeconds || 3));
  const [count, setCount] = useState(initial);
  const readyFired = useRef(false);
  const countScale = useSharedValue(1);
  const glow = useSharedValue(0.7);
  const vsSpin = useSharedValue(0);

  const youName = me?.displayName ?? "You";
  const oppName = preview.opponent.displayName;
  const oppAvatar = preview.opponent.avatarKey;
  const badgeLabel = preview.badgeLabel ?? "Opponent Found";
  const gameTitle = preview.gameTitle;

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.55, { duration: 700 })),
      -1,
      false,
    );
    vsSpin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
  }, [glow, vsSpin]);

  useEffect(() => {
    countScale.value = withSequence(
      withTiming(0.72, { duration: 120 }),
      withSpring(1.08, { damping: 10 }),
      withTiming(1, { duration: 120 }),
    );
    if (count > 0) void Haptics.selectionAsync();
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [count, countScale]);

  useEffect(() => {
    if (count > 0) {
      const t = setTimeout(() => setCount((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    // Hold at GO until the playable card is ready — never dump into "Game unavailable".
    if (launchError || readyFired.current) return;
    if (!gameReady) return;
    readyFired.current = true;
    onReady();
  }, [count, gameReady, launchError, onReady]);

  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: countScale.value }] }));
  const youGlowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const oppGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0.55, 1], [1, 0.55]),
  }));
  const vsRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${360 * vsSpin.value}deg` }],
  }));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} color={colors.paper} style={styles.close} />
        <Text style={[type.bodyLg, styles.headerTitle]} numberOfLines={1}>
          Opponent Found
        </Text>
        <Pressable accessibilityRole="button" onPress={onProfile} style={styles.avatarBtn}>
          <Ionicons name="person" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={[styles.ambient, styles.aLime]} />
        <View style={[styles.ambient, styles.aPink]} />

        <Animated.View entering={FadeIn.duration(300)} style={styles.badge}>
          <View style={styles.dot} />
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </Animated.View>
        {gameTitle ? (
          <Text style={styles.gameHint} numberOfLines={1}>
            Playing {gameTitle}
          </Text>
        ) : null}

        <View style={styles.stage}>
          <View style={styles.beam} />

          <View style={styles.col}>
            <Animated.View style={[styles.youGlow, youGlowStyle]} />
            <View style={styles.youFrame}>
              <AvatarImage displayName={youName} avatarKey={me?.avatarKey} size={104} />
            </View>
            <Text style={[type.bodyLg, styles.name]} numberOfLines={1}>
              {youName}
            </Text>
            <Text style={styles.roleYou}>YOU</Text>
          </View>

          <View style={styles.vsWrap}>
            <Animated.View style={[styles.vsRing, vsRingStyle]} />
            <View style={styles.vsOuter}>
              <View style={styles.vsInner}>
                <Text style={styles.vsText}>VS</Text>
              </View>
            </View>
            <Ionicons name="flash" size={14} color={surface.lime} style={styles.bolt} />
          </View>

          <View style={styles.col}>
            <Animated.View style={[styles.oppGlow, oppGlowStyle]} />
            <View style={styles.oppFrame}>
              <AvatarImage displayName={oppName} avatarKey={oppAvatar} size={104} />
            </View>
            <Text style={[type.bodyLg, styles.name]} numberOfLines={1}>
              {oppName}
            </Text>
            <Text style={styles.roleOpp}>OPPONENT</Text>
          </View>
        </View>

        <View style={styles.countdown}>
          <Animated.Text
            style={[
              type.largeScore,
              styles.countNum,
              count <= 0 && { color: surface.lime },
              countStyle,
            ]}
          >
            {count > 0 ? String(count) : launchError ? "!" : gameReady ? "GO!" : "…"}
          </Animated.Text>
          <View style={styles.dots}>
            {[1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.progressDot, initial - count >= i - 1 && styles.progressDotOn]}
              />
            ))}
          </View>
          {launchError ? (
            <>
              <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", paddingHorizontal: 24 }]}>
                {launchError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  readyFired.current = false;
                  onReady();
                }}
                style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <Text style={[type.bodySm, { color: colors.lilac }]}>
              {count > 0 ? "Battle starting..." : gameReady ? "Battle starting..." : "Loading game…"}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    height: 64,
    paddingHorizontal: spacing.margin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.paper,
    fontFamily: fonts.display,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.xl,
  },
  ambient: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.22,
  },
  aLime: { top: 20, left: -80, backgroundColor: surface.lime },
  aPink: { top: 160, right: -100, backgroundColor: colors.pink },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(42,27,78,0.7)",
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(189,245,50,0.2)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: surface.lime,
  },
  badgeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.paper,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  gameHint: {
    marginTop: 10,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.paper,
    letterSpacing: 0.3,
    textAlign: "center",
    paddingHorizontal: spacing.margin,
  },
  stage: {
    width: "100%",
    maxWidth: 360,
    paddingHorizontal: spacing.margin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  beam: {
    position: "absolute",
    left: 40,
    right: 40,
    height: 2,
    backgroundColor: "rgba(255,77,141,0.45)",
  },
  col: { flex: 1, alignItems: "center" },
  youGlow: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(189,245,50,0.5)",
  },
  youFrame: {
    borderRadius: 60,
    padding: 3,
    backgroundColor: surface.lime,
    shadowColor: surface.lime,
    shadowOpacity: 0.55,
    shadowRadius: 18,
  },
  oppGlow: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(255,77,141,0.5)",
  },
  oppFrame: {
    borderRadius: 60,
    padding: 3,
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.55,
    shadowRadius: 18,
  },
  name: {
    marginTop: spacing.md,
    color: colors.paper,
    fontFamily: fonts.display,
    textAlign: "center",
  },
  roleYou: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: surface.lime,
    letterSpacing: 1.2,
    fontWeight: "600",
    marginTop: 2,
  },
  roleOpp: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.pink,
    letterSpacing: 1.2,
    fontWeight: "600",
    marginTop: 2,
  },
  vsWrap: { alignItems: "center", marginHorizontal: 8, zIndex: 2 },
  vsRing: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: "rgba(255,77,141,0.35)",
    borderStyle: "dashed",
  },
  vsOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  vsInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  vsText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: "800",
    color: colors.paper,
  },
  bolt: { marginTop: 4 },
  countdown: { alignItems: "center", gap: 8 },
  countNum: {
    color: colors.paper,
    fontFamily: fonts.display,
    textShadowColor: "rgba(255,77,141,0.6)",
    textShadowRadius: 20,
  },
  dots: { flexDirection: "row", gap: 8, marginBottom: 4 },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(143,127,192,0.3)",
  },
  progressDotOn: {
    backgroundColor: surface.lime,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: surface.lime,
  },
  retryLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
});
