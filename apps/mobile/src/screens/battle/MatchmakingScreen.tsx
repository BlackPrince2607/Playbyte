import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OnlineMatch } from "../../api";
import { isApiError } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { CloseButton } from "../../components/CloseButton";
import { useApp } from "../../context/AppContext";
import { useLanguage } from "../../context/LanguageContext";
import {
  cancelMatchmakingTicket,
  enqueueMatchmaking,
  getMatchmakingTicket,
  matchmakingHeartbeat,
} from "../../lib/matchmaking";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  /** Theme lobby id (trivia, emoji, …). Server rotates games inside the pool. */
  category?: string;
  gameLabel: string;
  signedIn: boolean;
  onNeedSignIn: () => void;
  onCancel: () => void;
  onMatched: (match: OnlineMatch) => void;
  onProfile?: () => void;
};

type Phase = "searching" | "failed";

const MYSTERY = ["?", "⚡", "?", "⚔️"] as const;
const ARENA = 300;

function PingRing({
  size,
  borderColor,
  fill,
  delayMs,
  duration,
  boost,
}: {
  size: number;
  borderColor: string;
  fill: string;
  delayMs: number;
  duration: number;
  boost: SharedValue<number>;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [delayMs, duration, t]);

  const style = useAnimatedStyle(() => {
    const speed = 1 + boost.value * 0.55;
    const p = Math.min(1, t.value * speed);
    return {
      opacity: interpolate(p, [0, 0.15, 1], [0.55, 0.35, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 1], [0.35, 1.55], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor,
          backgroundColor: fill,
        },
        style,
      ]}
    />
  );
}

function RadarSweep({
  size,
  duration,
  reverse,
  colors: sweepColors,
  boost,
}: {
  size: number;
  duration: number;
  reverse?: boolean;
  colors: [string, string, string];
  boost: SharedValue<number>;
}) {
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.value = withRepeat(
      withTiming(1, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [duration, rot]);

  const style = useAnimatedStyle(() => {
    const extra = boost.value * 0.35;
    const angle = (reverse ? -360 : 360) * (rot.value + extra * rot.value);
    return { transform: [{ rotate: `${angle}deg` }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <LinearGradient
        colors={sweepColors}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 0.15 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function OrbitDots({ boost }: { boost: SharedValue<number> }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [rot]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${360 * rot.value * (1 + boost.value * 0.8)}deg` },
      { scaleY: 0.48 },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.orbitTrack, style]}>
      <View style={styles.orbitLime} />
      <View style={styles.orbitPink} />
    </Animated.View>
  );
}

function LiveDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })),
      -1,
      false,
    );
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.55, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 2.2]) }],
  }));
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, ring]} />
      <View style={styles.liveDotCore} />
    </View>
  );
}

function BounceDots() {
  return (
    <View style={styles.bounceRow}>
      {[0, 1, 2].map((i) => (
        <BounceDot key={i} delay={i * 140} color={i === 2 ? colors.pink : surface.lime} />
      ))}
    </View>
  );
}

function BounceDot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-6, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.bounceDot, { backgroundColor: color }, style]} />;
}

export function MatchmakingScreen({
  category,
  gameLabel,
  signedIn,
  onNeedSignIn,
  onCancel,
  onMatched,
  onProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { me } = useApp();
  const [phase, setPhase] = useState<Phase>("searching");
  const [error, setError] = useState("");
  const [searchKey, setSearchKey] = useState(0);
  const [mystery, setMystery] = useState<(typeof MYSTERY)[number]>("?");
  const [scanLabel, setScanLabel] = useState("Scanning ranked lobby…");
  const ticketId = useRef<string | null>(null);
  const onMatchedRef = useRef(onMatched);
  const onCancelRef = useRef(onCancel);
  const onNeedSignInRef = useRef(onNeedSignIn);
  onMatchedRef.current = onMatched;
  onCancelRef.current = onCancel;
  onNeedSignInRef.current = onNeedSignIn;

  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  const beam = useSharedValue(0.55);
  const vsPulse = useSharedValue(1);
  const boost = useSharedValue(0);
  const arenaPress = useSharedValue(1);

  useEffect(() => {
    ringA.value = withRepeat(withTiming(1, { duration: 8000, easing: Easing.linear }), -1, false);
    ringB.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false);
    beam.value = withRepeat(
      withSequence(withTiming(1, { duration: 900 }), withTiming(0.4, { duration: 900 })),
      -1,
      false,
    );
    vsPulse.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false,
    );
  }, [beam, ringA, ringB, vsPulse]);

  useEffect(() => {
    if (phase !== "searching") return;
    const labels = [
      `Scanning ${gameLabel} lobby…`,
      "Matching skill rating…",
      "Checking nearby rivals…",
      "Locking ranked seat…",
    ];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % labels.length;
      setScanLabel(labels[i]!);
    }, 2200);
    return () => clearInterval(id);
  }, [phase, gameLabel]);

  useEffect(() => {
    if (phase !== "searching") return;
    const id = setInterval(() => {
      setMystery((prev) => {
        const idx = MYSTERY.indexOf(prev);
        return MYSTERY[(idx + 1) % MYSTERY.length]!;
      });
    }, 1600);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!signedIn) {
      onNeedSignInRef.current();
      onCancelRef.current();
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    setPhase("searching");
    setError("");

    async function begin() {
      try {
        const ticket = await enqueueMatchmaking({
          category,
          extend: searchKey > 0,
        });
        if (cancelled) return;
        ticketId.current = ticket.id;
        if (ticket.match) {
          onMatchedRef.current(ticket.match);
          return;
        }
        pollTimer = setInterval(() => {
          void poll();
        }, 1200);
        heartbeatTimer = setInterval(() => {
          if (ticketId.current) void matchmakingHeartbeat(ticketId.current).catch(() => {});
        }, 5000);
      } catch (e) {
        if (cancelled) return;
        setPhase("failed");
        setError(isApiError(e) ? e.userMessage : t("matchSearchFailed"));
      }
    }

    async function poll() {
      if (!ticketId.current) return;
      try {
        const ticket = await getMatchmakingTicket(ticketId.current);
        if (ticket.match) {
          cleanup();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onMatchedRef.current(ticket.match);
          return;
        }
        if (ticket.status === "expired" || ticket.status === "cancelled") {
          setPhase("failed");
          setError(t("noOpponent"));
          cleanup();
        }
      } catch {
        /* keep polling */
      }
    }

    function cleanup() {
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }

    void begin();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [signedIn, category, searchKey, t]);

  async function handleCancel() {
    void Haptics.selectionAsync();
    if (ticketId.current && phase === "searching") {
      try {
        await cancelMatchmakingTicket(ticketId.current);
      } catch {
        /* ignore */
      }
    }
    onCancel();
  }

  function retry() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSearchKey((k) => k + 1);
  }

  function boostScan() {
    if (phase !== "searching") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    arenaPress.value = withSequence(withSpring(0.96), withSpring(1));
    boost.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(0, { duration: 1400, easing: Easing.out(Easing.cubic) }),
    );
    setScanLabel("Boosting radar sweep…");
  }

  const ringAStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-360 * ringA.value * (1 + boost.value * 0.5)}deg` }],
  }));
  const ringBStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${360 * ringB.value * (1 + boost.value * 0.5)}deg` }],
  }));
  const beamStyle = useAnimatedStyle(() => ({ opacity: beam.value }));
  const vsStyle = useAnimatedStyle(() => ({ transform: [{ scale: vsPulse.value }] }));
  const arenaStyle = useAnimatedStyle(() => ({ transform: [{ scale: arenaPress.value }] }));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CloseButton onPress={() => void handleCancel()} color={colors.paper} />
        <Text style={[type.bodyLg, styles.headerTitle]}>Battle</Text>
        <Pressable accessibilityRole="button" onPress={onProfile} style={styles.avatarBtn}>
          <Ionicons name="person" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.ambient, styles.ambientPink]} />
        <View style={[styles.ambient, styles.ambientLime]} />
        <View style={[styles.ambient, styles.ambientBottom]} />

        <View style={styles.badge}>
          <LiveDot />
          <Text style={styles.badgeText}>MATCHMAKING</Text>
        </View>

        <Pressable accessibilityRole="button" onPress={boostScan} style={styles.arenaHit}>
          <Animated.View style={[styles.arena, arenaStyle]}>
            {/* Concentric discs */}
            <View style={styles.discOuter} />
            <View style={styles.discMid} />
            <View style={styles.discCore} />

            {/* Expanding pings */}
            {phase === "searching" ? (
              <>
                <PingRing
                  size={176}
                  borderColor="rgba(189,245,50,0.55)"
                  fill="rgba(189,245,50,0.08)"
                  delayMs={0}
                  duration={2800}
                  boost={boost}
                />
                <PingRing
                  size={224}
                  borderColor="rgba(255,77,141,0.45)"
                  fill="rgba(255,77,141,0.07)"
                  delayMs={800}
                  duration={3400}
                  boost={boost}
                />
                <PingRing
                  size={280}
                  borderColor="rgba(189,245,50,0.3)"
                  fill="rgba(189,245,50,0.05)"
                  delayMs={1600}
                  duration={4000}
                  boost={boost}
                />
              </>
            ) : null}

            {/* Radar sweeps */}
            <RadarSweep
              size={210}
              duration={3000}
              boost={boost}
              colors={["transparent", "transparent", "rgba(189,245,50,0.45)"]}
            />
            <RadarSweep
              size={260}
              duration={4500}
              reverse
              boost={boost}
              colors={["transparent", "transparent", "rgba(255,77,141,0.38)"]}
            />

            {/* Dashed rings */}
            <Animated.View style={[styles.ringOuter, ringBStyle]} />
            <Animated.View style={[styles.ringInner, ringAStyle]} />

            {/* Center duel beam */}
            <Animated.View style={[styles.beam, beamStyle]} pointerEvents="none">
              <LinearGradient
                colors={["transparent", surface.lime, colors.paper, colors.pink, "transparent"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            <OrbitDots boost={boost} />

            {/* Face-off */}
            <View style={styles.faceOff}>
              <View style={styles.playerCol}>
                <View style={styles.youGlow} />
                <View style={styles.youRing}>
                  <AvatarImage
                    displayName={me?.displayName ?? "You"}
                    avatarKey={me?.avatarKey}
                    size={72}
                  />
                  <View style={styles.onlineBadge}>
                    <View style={styles.onlineCore} />
                  </View>
                </View>
                <View style={styles.youTag}>
                  <Text style={styles.youTagText}>YOU</Text>
                </View>
              </View>

              <Animated.View style={[styles.vsCore, vsStyle]}>
                <Text style={styles.vsCoreText}>VS</Text>
              </Animated.View>

              <View style={styles.playerCol}>
                <View style={styles.rivalGlow} />
                <View style={styles.rivalRing}>
                  <LinearGradient
                    colors={["rgba(255,77,141,0.35)", "transparent", "rgba(255,177,196,0.2)"]}
                    style={StyleSheet.absoluteFill}
                  />
                  <Ionicons name="game-controller" size={34} color="rgba(245,240,255,0.28)" />
                  <Text style={styles.qMark}>{mystery}</Text>
                  <View style={styles.radarBadge}>
                    <Ionicons name="radio-outline" size={11} color={colors.ink} />
                  </View>
                </View>
                <View style={styles.rivalTag}>
                  <Text style={styles.rivalTagText}>RIVAL</Text>
                </View>
              </View>
            </View>
          </Animated.View>
          {phase === "searching" ? (
            <Text style={styles.tapHint}>Tap radar to boost scan</Text>
          ) : null}
        </Pressable>

        {phase === "searching" ? (
          <Animated.View entering={FadeIn.duration(280)} style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={[type.gameQuestion, { color: colors.paper }]}>Finding opponent</Text>
              <BounceDots />
            </View>
            <Text style={[type.metadata, styles.scanText]}>{scanLabel}</Text>
            <View style={styles.lobbyPill}>
              <Ionicons name="layers-outline" size={14} color={surface.lime} />
              <Text style={styles.lobbyText}>{gameLabel}</Text>
            </View>
          </Animated.View>
        ) : (
          <View style={styles.copy}>
            <Text style={[type.bodyLg, { color: colors.paper, textAlign: "center" }]}>
              {error || t("noOpponent")}
            </Text>
            <Pressable
              onPress={retry}
              style={({ pressed }) => [styles.retryBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <Ionicons name="refresh" size={18} color={colors.ink} />
              <Text style={[type.button, { color: colors.ink }]}>{t("tryAgain")}</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => void handleCancel()}
          style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
          <Ionicons name="close" size={18} color={colors.lilac} />
          <Text style={[type.bodySm, { color: colors.paper, fontFamily: fonts.bodyBold }]}>CANCEL</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    height: 56,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: colors.paper,
    fontFamily: fonts.display,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.margin,
    alignItems: "center",
    justifyContent: "space-between",
  },
  ambient: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.28,
  },
  ambientPink: { top: 20, left: -70, backgroundColor: colors.pink },
  ambientLime: { top: 160, right: -90, backgroundColor: surface.lime },
  ambientBottom: {
    bottom: 40,
    left: "20%",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.pink,
    opacity: 0.12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(42,27,78,0.88)",
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(189,245,50,0.18)",
  },
  liveDotWrap: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  liveDotRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: surface.lime,
  },
  liveDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: surface.lime,
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.8,
    color: surface.lime,
    fontWeight: "700",
  },
  arenaHit: { alignItems: "center", width: "100%" },
  arena: {
    width: "100%",
    maxWidth: 360,
    height: ARENA,
    alignItems: "center",
    justifyContent: "center",
  },
  tapHint: {
    marginTop: 8,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.lilac,
    letterSpacing: 0.4,
  },
  discOuter: {
    position: "absolute",
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: "rgba(33,21,64,0.45)",
  },
  discMid: {
    position: "absolute",
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: "rgba(42,27,78,0.55)",
  },
  discCore: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(21,14,43,0.75)",
  },
  ringOuter: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: "rgba(255,77,141,0.6)",
    borderStyle: "dashed",
  },
  ringInner: {
    position: "absolute",
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 2.5,
    borderColor: "rgba(189,245,50,0.75)",
    borderStyle: "dashed",
  },
  beam: {
    position: "absolute",
    width: "78%",
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    zIndex: 3,
  },
  orbitTrack: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  orbitLime: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: surface.lime,
    shadowColor: surface.lime,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  orbitPink: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  faceOff: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    zIndex: 4,
  },
  playerCol: { alignItems: "center", gap: 8, width: 100 },
  youGlow: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(189,245,50,0.28)",
  },
  youRing: {
    borderRadius: 42,
    padding: 3,
    backgroundColor: surface.lime,
  },
  onlineBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: surface.lime,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.ink,
  },
  youTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: surface.lime,
  },
  youTagText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: 1,
  },
  rivalGlow: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,77,141,0.24)",
  },
  rivalRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.pink,
    overflow: "hidden",
  },
  qMark: {
    position: "absolute",
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.pinkSoft,
  },
  radarBadge: {
    position: "absolute",
    left: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.pink,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  rivalTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  rivalTagText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.lilac,
    fontWeight: "700",
    letterSpacing: 1,
  },
  vsCore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(21,14,43,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(245,240,255,0.18)",
    zIndex: 5,
  },
  vsCoreText: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.paper,
    fontWeight: "700",
  },
  copy: { alignItems: "center", gap: 8, paddingHorizontal: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  scanText: { color: colors.lilac, textAlign: "center" },
  lobbyPill: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(42,27,78,0.7)",
  },
  lobbyText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.paper,
    letterSpacing: 0.6,
  },
  bounceRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 6 },
  bounceDot: { width: 6, height: 6, borderRadius: 3 },
  retryBtn: {
    marginTop: spacing.md,
    backgroundColor: surface.lime,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(42,27,78,0.92)",
    borderWidth: 1,
    borderColor: "rgba(245,240,255,0.08)",
  },
});
