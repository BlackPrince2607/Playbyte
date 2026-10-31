import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { HintBar, TileState } from "../../../ui/kit";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import { useShake } from "../../../ui/motion";
import type { EngineViewProps } from "../../../ui/types";
import type { QuizAction, QuizState } from "../../quiz/logic/types";
import { VERIFY_YES } from "../logic/problems";

function AnswerTile({
  label,
  state,
  disabled,
  size,
  index,
  onPress,
}: {
  label: string;
  state: TileState;
  disabled: boolean;
  size: number;
  index: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || state === "eliminated";
  return (
    <Animated.View
      entering={prefersReducedMotion() ? undefined : FadeInDown.delay(index * 30).duration(180)}
      style={[anim, { width: size }, state === "eliminated" && { opacity: 0.2 }, state === "dim" && { opacity: 0.5 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off, selected: state === "correct" }}
        disabled={off}
        onPress={() => {
          if (!prefersReducedMotion()) scale.value = withSequence(withTiming(0.92, { duration: 50 }), withSpring(1));
          feedback("tap");
          onPress();
        }}
        style={({ pressed }) => [
          styles.numTile,
          { height: Math.max(76, size * 0.7) },
          state === "correct" && styles.correct,
          state === "wrong" && styles.wrong,
          pressed && !off && { borderColor: colors.lime },
        ]}
      >
        <Text style={[styles.numLabel, (state === "correct" || state === "wrong") && { color: colors.ink }]} adjustsFontSizeToFit numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Big equation hero + 2×2 answer grid (solve/blitz) or True/Trap duo (verify). */
export function MathRushView({ state, dispatch, requestHint, snapshot }: EngineViewProps<QuizState, QuizAction>) {
  const { width } = useWindowDimensions();
  const q = state.q;
  const wrongSeq = snapshot.lastOutcome && !snapshot.lastOutcome.correct ? snapshot.lastOutcome.seq : 0;
  const shake = useShake(wrongSeq);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (prefersReducedMotion() || state.streak < 2 || state.answer) return;
    pulse.value = withSequence(withTiming(1.04, { duration: 90 }), withSpring(1, { damping: 12 }));
  }, [state.round, state.streak, state.answer, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (!q) return null;
  const answered = state.answer;
  const expression = q.clues[0]?.value ?? "";
  const verify = q.options.length === 2 && q.options.some((o) => o.id === VERIFY_YES);
  const cols = 2;
  const gap = spacing.sm;
  const size = Math.floor((Math.min(width, 420) - spacing.margin * 2 - gap) / cols);

  const tileState = (id: string): TileState => {
    if (state.eliminated.includes(id)) return "eliminated";
    if (!answered) return "idle";
    if (id === q.answerId) return "correct";
    if (id === answered.optionId) return "wrong";
    return "dim";
  };

  const streakHot = state.streak >= 3 && !answered;

  return (
    <View style={styles.root}>
      <Text style={[type.metadata, styles.prompt]} accessibilityRole="header">
        {q.prompt}
      </Text>

      <Animated.View style={[shake, pulseStyle, styles.hero, streakHot && styles.heroHot]}>
        <Text
          style={[styles.expression, expression.length > 12 && { fontSize: 36, lineHeight: 42 }]}
          accessibilityLabel={`Equation: ${expression}`}
          adjustsFontSizeToFit
          numberOfLines={2}
        >
          {expression}
        </Text>
        {!verify ? <Text style={styles.equals}>= ?</Text> : null}
      </Animated.View>

      {q.clues.slice(1, state.revealed).map((c) => (
        <Animated.Text key={c.value} entering={FadeIn} style={styles.hintText}>
          💡 {c.value}
        </Animated.Text>
      ))}

      {verify ? (
        <View style={styles.verifyRow}>
          {q.options.map((o, i) => {
            const st = tileState(o.id);
            const yes = o.id === VERIFY_YES;
            return (
              <Animated.View
                key={o.id}
                entering={prefersReducedMotion() ? undefined : FadeInDown.delay(i * 40).duration(200)}
                style={{ flex: 1 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  disabled={!!answered || snapshot.status !== "playing"}
                  onPress={() => {
                    feedback("tap");
                    dispatch({ type: "answer", optionId: o.id });
                  }}
                  style={({ pressed }) => [
                    styles.verifyBtn,
                    yes ? styles.verifyYes : styles.verifyNo,
                    st === "correct" && styles.correct,
                    st === "wrong" && styles.wrong,
                    st === "dim" && { opacity: 0.45 },
                    pressed && !answered && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.verifyGlyph}>{yes ? "✓" : "✕"}</Text>
                  <Text style={[styles.verifyLabel, (st === "correct" || st === "wrong") && { color: colors.ink }]}>
                    {o.label}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ) : (
        <Animated.View style={[shake, { flexDirection: "row", flexWrap: "wrap", gap, width: size * cols + gap }]}>
          {q.options.map((o, i) => (
            <AnswerTile
              key={`${q.id}-${o.id}`}
              index={i}
              size={size}
              label={o.label}
              state={tileState(o.id)}
              disabled={!!answered || snapshot.status !== "playing"}
              onPress={() => dispatch({ type: "answer", optionId: o.id })}
            />
          ))}
        </Animated.View>
      )}

      <HintBar hints={snapshot.hints} onHint={requestHint} />

      {answered && answered.optionId === null ? (
        <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]}>Time's up!</Text>
      ) : null}
      {answered && q.explanation ? (
        <Text style={[type.bodySm, { color: colors.paper, textAlign: "center", paddingHorizontal: spacing.md }]}>
          {q.explanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  prompt: {
    color: colors.lilac,
    textAlign: "center",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  hero: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  heroHot: {
    borderColor: colors.lime,
  },
  expression: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "700",
    color: colors.paper,
    textAlign: "center",
  },
  equals: {
    fontFamily: fonts.mono,
    fontSize: 22,
    color: colors.lilac,
  },
  hintText: {
    ...type.bodySm,
    color: colors.paper,
    textAlign: "center",
  },
  verifyRow: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
    maxWidth: 420,
  },
  verifyBtn: {
    borderRadius: radius.lg,
    borderWidth: 2,
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  verifyYes: {
    backgroundColor: colors.limeFill,
    borderColor: colors.lime,
  },
  verifyNo: {
    backgroundColor: colors.pinkFill,
    borderColor: colors.pink,
  },
  verifyGlyph: {
    fontSize: 28,
    lineHeight: 32,
    color: colors.paper,
  },
  verifyLabel: {
    ...type.button,
    color: colors.paper,
  },
  numTile: {
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  numLabel: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    color: colors.paper,
    textAlign: "center",
  },
  correct: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  wrong: {
    backgroundColor: colors.pink,
    borderColor: colors.pink,
  },
});
