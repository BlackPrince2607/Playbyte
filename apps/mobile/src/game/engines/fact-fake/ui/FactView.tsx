import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeIn,
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
import { prefersReducedMotion } from "../../../ui/feedback";
import type { EngineViewProps } from "../../../ui/types";
import type { QuizAnswer, QuizAction, QuizQuestion, QuizState } from "../../quiz/logic/types";
import { FACT_ID, FAKE_ID } from "../logic/engine";

type CardProps = { q: QuizQuestion; answered: QuizAnswer | null; disabled: boolean; onAnswer: (id: string) => void };

/** Swipe right for Fact, left for Fake. Buttons below do the same for players who prefer tapping. */
function StatementCard({ q, answered, disabled, onAnswer }: CardProps) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.22;
  const tx = useSharedValue(0);

  useEffect(() => {
    if (!answered?.optionId || prefersReducedMotion()) return;
    const dir = answered.optionId === FACT_ID ? 1 : -1;
    tx.value = withSequence(withTiming(dir * 36, { duration: 110 }), withSpring(0, { damping: 14 }));
  }, [answered, tx]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      tx.value = e.translationX;
    })
    .onEnd((e) => {
      const commit = Math.abs(e.translationX) > threshold || Math.abs(e.velocityX) > 900;
      if (commit) onAnswer(e.translationX > 0 ? FACT_ID : FAKE_ID);
      tx.value = withSpring(0, { damping: 16 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { rotate: `${tx.value / 22}deg` }],
  }));
  const factTag = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, threshold], [0, 1], Extrapolation.CLAMP) }));
  const fakeTag = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP) }));

  const truthIsFact = q.answerId === FACT_ID;
  const border = answered ? (answered.correct ? colors.lime : colors.pink) : colors.line;
  const emoji = q.clues.find((c) => c.kind === "emoji")?.value;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        entering={prefersReducedMotion() ? undefined : FadeInDown.duration(260)}
        style={[styles.card, { borderColor: border }, cardStyle]}
        accessible
        accessibilityLabel={`Statement: ${q.prompt}`}
        accessibilityHint="Swipe right if it's a fact, left if it's fake, or use the buttons below"
      >
        <Animated.Text style={[styles.tag, styles.tagFact, factTag]}>FACT</Animated.Text>
        <Animated.Text style={[styles.tag, styles.tagFake, fakeTag]}>FAKE</Animated.Text>
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Text style={styles.statement}>{q.prompt}</Text>
        {answered ? (
          <Animated.View entering={prefersReducedMotion() ? undefined : FadeIn.duration(200)} style={[styles.stamp, { borderColor: truthIsFact ? colors.lime : colors.pink }]}>
            <Text style={[styles.stampText, { color: truthIsFact ? colors.lime : colors.pink }]}>{truthIsFact ? "✓ FACT" : "✗ FAKE"}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

function VerdictButton({ id, label, color, disabled, picked, onPress }: { id: string; label: string; color: string; disabled: boolean; picked: boolean; onPress: (id: string) => void }) {
  return (
    <Pressable
      onPress={() => onPress(id)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: picked }}
      style={({ pressed }) => [
        styles.button,
        { borderColor: color, backgroundColor: picked ? color : "transparent", opacity: disabled && !picked ? 0.45 : 1 },
        pressed && !disabled && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text style={[type.button, { color: picked ? colors.ink : color }]}>{label}</Text>
    </Pressable>
  );
}

export function FactView({ state, dispatch, snapshot }: EngineViewProps<QuizState, QuizAction>) {
  const q = state.q;
  if (!q) return null;
  const answered = state.answer;
  const disabled = !!answered || snapshot.status !== "playing";
  const answer = (optionId: string) => {
    if (disabled) return;
    dispatch({ type: "answer", optionId });
  };

  return (
    <View style={styles.root}>
      <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
        {answered ? " " : "Swipe right for Fact, left for Fake"}
      </Text>
      <StatementCard key={q.id} q={q} answered={answered} disabled={disabled} onAnswer={answer} />
      <View style={styles.buttons}>
        <VerdictButton id={FAKE_ID} label="✗ Fake" color={colors.pink} disabled={disabled} picked={answered?.optionId === FAKE_ID} onPress={answer} />
        <VerdictButton id={FACT_ID} label="✓ Fact" color={colors.lime} disabled={disabled} picked={answered?.optionId === FACT_ID} onPress={answer} />
      </View>
      {answered ? (
        <Animated.View entering={prefersReducedMotion() ? undefined : FadeIn.duration(220)} style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <Text style={[type.bodyLg, { color: answered.correct ? colors.lime : colors.pink, textAlign: "center", fontFamily: fonts.bodyBold }]}>
            {answered.optionId === null ? "Time's up!" : answered.correct ? "Correct!" : "Not quite."}
          </Text>
          {q.explanation ? <Text style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>{q.explanation}</Text> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.lg, gap: spacing.md },
  card: {
    minHeight: 260,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.card,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  emoji: { fontSize: 56 },
  statement: { ...type.gameQuestion, fontSize: 24, lineHeight: 30, color: colors.paper, textAlign: "center" },
  tag: { position: "absolute", top: spacing.md, fontFamily: fonts.display, fontSize: 22, borderWidth: 2, borderRadius: radius.sm, paddingHorizontal: 8 },
  tagFact: { left: spacing.md, color: colors.lime, borderColor: colors.lime, transform: [{ rotate: "-12deg" }] },
  tagFake: { right: spacing.md, color: colors.pink, borderColor: colors.pink, transform: [{ rotate: "12deg" }] },
  stamp: { borderWidth: 3, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 2, transform: [{ rotate: "-6deg" }] },
  stampText: { fontFamily: fonts.display, fontSize: 26 },
  buttons: { flexDirection: "row", gap: spacing.md },
  button: { flex: 1, minHeight: 56, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
