import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { ScrollView, StyleSheet, Text, View, type ColorValue } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { SlideInLeft, SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { MazePreview, PREVIEW_XP, PollPreview, QuizPreview, WordSearchPreview } from "./GamePreviewCards";
import { BackButton, CtaButton, Glow, PageDots, onboardingStyles, useFloat } from "./ui";

type Props = {
  page: number;
  onPageChange: (page: number) => void;
  onNext: () => void;
  onBack: () => void;
};

const SLIDES = 2;
const CARDS: ComponentType[] = [QuizPreview, MazePreview, PollPreview, WordSearchPreview];
const AUTO_ADVANCE_MS = 3500;
const PAUSE_AFTER_TOUCH_MS = 6000;

export function IntroSlidesScreen({ page, onPageChange, onNext, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const lastPage = useRef(page);
  const forward = page >= lastPage.current;
  useEffect(() => {
    lastPage.current = page;
  }, [page]);

  const next = () => (page < SLIDES - 1 ? onPageChange(page + 1) : onNext());
  const back = () => (page > 0 ? onPageChange(page - 1) : onBack());

  return (
    <View style={[onboardingStyles.root, page === 1 && { backgroundColor: "#11111a" }]}>
      <Animated.View
        key={page}
        entering={(forward ? SlideInRight : SlideInLeft).duration(260)}
        style={{ flex: 1, paddingTop: insets.top + 8 }}
      >
        {page === 0 ? <GamesSlide onBack={back} /> : <CompeteSlide onBack={back} />}
      </Animated.View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PageDots count={SLIDES} active={page} />
        <CtaButton label="Continue" onPress={next} />
      </View>
    </View>
  );
}

function GamesSlide({ onBack }: { onBack: () => void }) {
  const [card, setCard] = useState(0);
  return (
    <>
      <Glow color="rgba(255,77,141,0.18)" size={320} style={{ top: -60, alignSelf: "center" }} />
      <Glow color="rgba(189,245,50,0.10)" size={260} style={{ top: 280, right: -90 }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={onboardingStyles.header}>
          <BackButton onPress={onBack} />
          <View style={styles.cardDots}>
            {CARDS.map((_, i) => (
              <View key={i} style={[styles.cardDot, i === card && { backgroundColor: surface.lime }]} />
            ))}
          </View>
        </View>
        <Text style={[styles.hero, { marginTop: spacing.sm }]}>
          Play{"\n"}bite-sized <Text style={onboardingStyles.accent}>games.</Text>
        </Text>
        <Text style={[type.bodyLg, styles.lede]}>Quizzes, puzzles, polls, trivia and more. New games every day.</Text>
        <GameCarousel index={card} onIndex={setCard} />
      </ScrollView>
    </>
  );
}

function GameCarousel({ index, onIndex }: { index: number; onIndex: (i: number) => void }) {
  const ref = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const indexRef = useRef(index);
  indexRef.current = index;
  const pausedUntil = useRef(0);
  const bob = useFloat(900, -6);

  useEffect(() => {
    if (!width) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const nextIndex = (indexRef.current + 1) % CARDS.length;
      ref.current?.scrollTo({ x: nextIndex * width, animated: true });
      onIndex(nextIndex);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [width, onIndex]);

  return (
    <View style={styles.stage}>
      <LinearGradient
        colors={["rgba(42,27,78,0.4)", "rgba(255,77,141,0.1)", "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={styles.stageGlow}
      />
      <View style={styles.frame}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width ? (
            <ScrollView
              ref={ref}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScrollBeginDrag={() => {
                pausedUntil.current = Date.now() + PAUSE_AFTER_TOUCH_MS;
              }}
              onMomentumScrollEnd={(e) => {
                pausedUntil.current = Date.now() + PAUSE_AFTER_TOUCH_MS;
                onIndex(Math.round(e.nativeEvent.contentOffset.x / width));
              }}
            >
              {CARDS.map((Card, i) => (
                <View key={i} style={{ width }}>
                  <Card />
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
        <Animated.View style={[styles.xp, bob]}>
          <Ionicons name="flash" size={18} color={surface.lime} />
          <Text style={styles.xpText}>+{PREVIEW_XP[index]} XP</Text>
        </Animated.View>
      </View>
    </View>
  );
}

type Player = { name: string; score: number; emoji: string; ring: readonly [ColorValue, ColorValue, ...ColorValue[]]; badge: string };

const PODIUM_LEFT: Player = { name: "Rahul", score: 820, emoji: "👦🏻", ring: ["#d97706", "#4f46e5"], badge: "#3b4252" };
const PODIUM_RIGHT: Player = { name: "Priya", score: 790, emoji: "👧🏽", ring: ["#a855f7", "#ec4899"], badge: "#c2593f" };
const RUNNERS_UP = [
  { rank: 4, name: "Arjun", score: 710, emoji: "👨🏽", tint: "rgba(59,130,246,0.2)" },
  { rank: 5, name: "Neha", score: 690, emoji: "👩🏻", tint: "rgba(244,63,94,0.2)" },
  { rank: 6, name: "Kabir", score: 630, emoji: "🧔🏻", tint: "rgba(16,185,129,0.2)" },
];

function Podium({ player, rank }: { player: Player; rank: number }) {
  return (
    <View style={styles.podium}>
      <View>
        <LinearGradient colors={player.ring} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.ring56}>
          <View style={styles.avatarInner}>
            <Text style={{ fontSize: 20 }}>{player.emoji}</Text>
          </View>
        </LinearGradient>
        <View style={[styles.rank, { backgroundColor: player.badge }]}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
      </View>
      <Text style={styles.podiumName}>{player.name}</Text>
      <Text style={styles.podiumScore}>{player.score}</Text>
    </View>
  );
}

function CompeteSlide({ onBack }: { onBack: () => void }) {
  const crown = useFloat(700, -6);
  return (
    <>
      <Glow color="rgba(255,77,141,0.2)" size={360} style={{ top: -160, alignSelf: "center" }} />
      <Glow color="rgba(124,58,237,0.14)" size={280} style={{ top: 320, right: -110 }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={onboardingStyles.header}>
          <BackButton onPress={onBack} />
        </View>
        <Text style={[styles.competeTitle, { marginTop: spacing.md }]}>
          Play. Compete.{"\n"}
          <Text style={onboardingStyles.accent}>Together.</Text>
        </Text>
        <Text style={styles.competeLede}>
          Instant results, <Text style={styles.live}>live</Text> rankings and friendly competition.
        </Text>

        <View style={styles.board}>
          <Glow color="rgba(255,184,0,0.2)" size={220} style={{ top: -110, alignSelf: "center" }} />
          <View style={styles.crownWrap}>
            <View style={styles.rays}>
              <View style={[styles.ray, { backgroundColor: colors.pink, transform: [{ rotate: "-28deg" }] }]} />
              <View style={[styles.ray, { backgroundColor: surface.gold, height: 14, transform: [{ rotate: "-8deg" }, { translateY: -4 }] }]} />
              <View style={[styles.ray, { backgroundColor: "#ccff00", transform: [{ rotate: "22deg" }] }]} />
            </View>
            <Animated.Text style={[styles.crown, crown]}>👑</Animated.Text>
          </View>

          <View style={styles.podiumRow}>
            <Podium player={PODIUM_LEFT} rank={2} />
            <View style={[styles.podium, { transform: [{ translateY: -8 }] }]}>
              <View>
                <LinearGradient
                  colors={["#ccff00", "#34d399", "#fde047"]}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ring72}
                >
                  <View style={[styles.avatarInner, { backgroundColor: "#1a1b2e", borderColor: "rgba(255,255,255,0.3)" }]}>
                    <Text style={{ fontSize: 24 }}>🧑🏻‍💻</Text>
                  </View>
                </LinearGradient>
                <View style={styles.youPill}>
                  <Text style={styles.youPillText}>YOU</Text>
                </View>
                <View style={[styles.rank, styles.rankGold]}>
                  <Text style={[styles.rankText, { color: "#000", fontSize: 11 }]}>1</Text>
                </View>
              </View>
              <Text style={styles.youName}>You</Text>
              <Text style={styles.youScore}>860</Text>
            </View>
            <Podium player={PODIUM_RIGHT} rank={3} />
          </View>

          <View style={{ marginTop: 12, gap: 6 }}>
            {RUNNERS_UP.map((r) => (
              <View key={r.rank} style={styles.runner}>
                <View style={styles.runnerLeft}>
                  <Text style={styles.runnerRank}>{r.rank}</Text>
                  <View style={[styles.runnerAvatar, { backgroundColor: r.tint }]}>
                    <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                  </View>
                  <Text style={styles.runnerName}>{r.name}</Text>
                </View>
                <Text style={styles.runnerScore}>{r.score}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.lg },
  footer: { paddingHorizontal: spacing.margin, paddingTop: spacing.sm, gap: 20 },
  cardDots: { flexDirection: "row", gap: 8 },
  cardDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: surface.highest },
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.6, color: surface.onSurface },
  lede: { color: surface.onSurfaceVariant, maxWidth: 290, marginTop: spacing.sm },
  stage: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, marginTop: spacing.md },
  stageGlow: { ...StyleSheet.absoluteFill, borderRadius: 24, transform: [{ scale: 0.95 }] },
  frame: {
    width: "100%",
    maxWidth: 325,
    backgroundColor: colors.card,
    borderRadius: 32,
    padding: 16,
    transform: [{ rotate: "-2deg" }],
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)",
  },
  xp: {
    position: "absolute",
    right: -12,
    bottom: -12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(189,245,50,0.2)",
    boxShadow: "0 10px 20px rgba(0,0,0,0.4)",
  },
  xpText: { fontFamily: fonts.mono, fontSize: 10, color: surface.lime },
  competeTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, color: "#fff" },
  competeLede: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20, color: "rgba(255,255,255,0.6)", marginTop: 4 },
  live: {
    color: "#ccff00",
    fontFamily: fonts.bodyBold,
    textShadowColor: "rgba(204,255,0,0.6)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  board: {
    marginTop: spacing.xl,
    backgroundColor: "rgba(21,21,34,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 28,
    padding: 16,
    paddingTop: 20,
    overflow: "hidden",
    boxShadow: "0 20px 40px -15px rgba(255,77,141,0.12)",
  },
  crownWrap: { alignItems: "center", marginBottom: 8 },
  rays: { position: "absolute", top: -6, width: 128, flexDirection: "row", justifyContent: "space-around" },
  ray: { width: 5, height: 12, borderRadius: 3 },
  crown: { fontSize: 30, textShadowColor: "rgba(255,184,0,0.6)", textShadowRadius: 12 },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: 4,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  podium: { flex: 1, alignItems: "center" },
  ring56: { width: 56, height: 56, borderRadius: 28, padding: 2 },
  ring72: { width: 72, height: 72, borderRadius: 36, padding: 2.5, boxShadow: "0 0 25px rgba(204,255,0,0.25)" },
  avatarInner: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#202030",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rank: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#151522",
    alignItems: "center",
    justifyContent: "center",
  },
  rankGold: { width: 24, height: 24, borderRadius: 12, backgroundColor: surface.gold },
  rankText: { fontFamily: fonts.bodyBold, fontSize: 10, color: "#fff" },
  podiumName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 8 },
  podiumScore: { fontFamily: fonts.bodyBold, fontSize: 12, color: "rgba(255,255,255,0.6)" },
  youPill: {
    position: "absolute",
    top: -8,
    alignSelf: "center",
    backgroundColor: "#ccff00",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  youPillText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: "#000" },
  youName: { fontFamily: fonts.bodyBold, fontSize: 14, color: "#fff", marginTop: 6 },
  youScore: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: "#ccff00",
    textShadowColor: "rgba(204,255,0,0.6)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  runner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  runnerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  runnerRank: { fontFamily: fonts.bodyBold, fontSize: 12, width: 12, textAlign: "center", color: "rgba(255,255,255,0.4)" },
  runnerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  runnerName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: "rgba(255,255,255,0.9)" },
  runnerScore: { fontFamily: fonts.bodyBold, fontSize: 12, color: "rgba(255,255,255,0.7)" },
});
