import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import { useShake } from "../../../ui/motion";
import type { EngineViewProps } from "../../../ui/types";
import type { MemoryAction, MemoryCard, MemoryState } from "../logic/engine";

const COLS = 4;

function FlipCard({
  card,
  size,
  index,
  disabled,
  onPress,
}: {
  card: MemoryCard;
  size: number;
  index: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const open = card.faceUp || card.matched;
  const rot = useSharedValue(open ? 180 : 0);
  const scale = useSharedValue(1);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      rot.value = open ? 180 : 0;
      return;
    }
    rot.value = withTiming(open ? 180 : 0, { duration: 280 });
    if (card.matched) {
      scale.value = withSequence(withSpring(1.08, { damping: 12 }), withSpring(1));
    }
  }, [open, card.matched, reduced, rot, scale]);

  const faceStyle = useAnimatedStyle(() => {
    const r = rot.value;
    return {
      transform: [
        { perspective: 900 },
        { rotateY: `${r}deg` },
        { scale: scale.value },
      ],
      opacity: interpolate(r, [0, 90, 180], [1, 0.35, 1]),
    };
  });

  const showFace = open;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <Pressable
        onPress={onPress}
        disabled={disabled || card.matched || card.faceUp}
        accessibilityRole="button"
        accessibilityLabel={showFace ? `Card ${card.face}` : `Face-down card ${index + 1}`}
        style={[styles.press, { width: size, height: size * 1.25 }]}
      >
        <Animated.View
          style={[
            styles.card,
            showFace ? styles.cardFace : styles.cardBack,
            card.matched && styles.cardMatched,
            { width: size, height: size * 1.25 },
            faceStyle,
          ]}
        >
          {showFace ? (
            <Text style={styles.emoji}>{card.face}</Text>
          ) : (
            <View style={styles.backMark}>
              <View style={styles.backOrb} />
              <Text style={styles.backGlyph}>✦</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function PairView({ state, dispatch, snapshot }: EngineViewProps<MemoryState, MemoryAction>) {
  const { width } = useWindowDimensions();
  const playing = snapshot.status === "playing";
  const wrongSeq = snapshot.lastOutcome && !snapshot.lastOutcome.correct ? snapshot.lastOutcome.seq : 0;
  const shake = useShake(wrongSeq);
  const gap = spacing.sm;
  const boardW = Math.min(width - spacing.margin * 2, 420);
  const size = Math.floor((boardW - gap * (COLS - 1)) / COLS);

  useEffect(() => {
    if (!snapshot.lastOutcome) return;
    feedback(snapshot.lastOutcome.correct ? "success" : "error");
  }, [snapshot.lastOutcome?.seq]);

  return (
    <View style={styles.root}>
      <Text style={[type.bodyLg, styles.prompt]} accessibilityRole="header">
        Match every pair
      </Text>
      <Text style={[type.bodySm, styles.sub]}>
        {state.matches}/{Math.floor(state.cards.length / 2)} pairs · {state.theme}
      </Text>
      <Animated.View style={[shake, styles.grid, { width: size * COLS + gap * (COLS - 1) }]}>
        {state.cards.map((card, i) => (
          <FlipCard
            key={card.id}
            card={card}
            size={size}
            index={i}
            disabled={!playing || state.lockUntil !== null || state.roundOver}
            onPress={() => {
              feedback("tap");
              dispatch({ type: "flip", index: i });
            }}
          />
        ))}
      </Animated.View>
      {state.roundOver && !state.cleared ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.md }]}>Time&apos;s up!</Text>
      ) : null}
      {state.cleared ? (
        <Text style={[type.bodySm, { color: colors.lime, marginTop: spacing.md, fontFamily: fonts.bodyBold }]}>Board cleared!</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  prompt: { color: colors.lilac, textAlign: "center" },
  sub: { color: colors.paper, textAlign: "center", opacity: 0.7, textTransform: "capitalize" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "center",
  },
  press: { borderRadius: radius.lg },
  card: {
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardBack: {
    backgroundColor: "#2A1B4E",
    borderWidth: 1.5,
    borderColor: "rgba(99, 91, 255, 0.55)",
    shadowColor: "#635BFF",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cardFace: {
    backgroundColor: "rgba(245, 240, 255, 0.96)",
    borderWidth: 1.5,
    borderColor: "rgba(198, 255, 61, 0.35)",
  },
  cardMatched: {
    borderColor: colors.lime,
    opacity: 0.72,
  },
  emoji: { fontSize: 36, lineHeight: 44 },
  backMark: { alignItems: "center", justifyContent: "center" },
  backOrb: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(99, 91, 255, 0.28)",
  },
  backGlyph: { color: colors.lilac, fontSize: 22, fontFamily: fonts.bodyBold },
});
