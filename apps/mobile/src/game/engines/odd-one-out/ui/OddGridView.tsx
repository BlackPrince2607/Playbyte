import React from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, spacing } from "../../../../theme/colors";
import { type } from "../../../../theme/typography";
import { GridTile, HintBar, TileState } from "../../../ui/kit";
import { useShake } from "../../../ui/motion";
import type { EngineViewProps } from "../../../ui/types";
import type { QuizAction, QuizState } from "../../quiz/logic/types";

const columnsFor = (n: number, textual: boolean) => (n <= 4 ? 2 : n <= 6 ? (textual ? 2 : 3) : n <= 9 ? 3 : 4);

/** Card-grid presentation of a quiz question (Odd One Out). */
export function OddGridView({ state, dispatch, requestHint, snapshot }: EngineViewProps<QuizState, QuizAction>) {
  const { width } = useWindowDimensions();
  const q = state.q;
  const wrongSeq = snapshot.lastOutcome && !snapshot.lastOutcome.correct ? snapshot.lastOutcome.seq : 0;
  const shake = useShake(wrongSeq);
  if (!q) return null;
  const answered = state.answer;
  const textual = q.options.some((o) => o.label);
  const cols = columnsFor(q.options.length, textual);
  const gap = spacing.sm;
  const size = Math.floor((Math.min(width, 520) - spacing.margin * 2 - gap * (cols - 1)) / cols);

  const tileState = (id: string): TileState => {
    if (state.eliminated.includes(id)) return "eliminated";
    if (!answered) return "idle";
    if (id === q.answerId) return "correct";
    if (id === answered.optionId) return "wrong";
    return "dim";
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.margin, paddingBottom: spacing.lg, gap: spacing.md, alignItems: "center" }} bounces={false}>
      <Text style={[type.bodyLg, { color: colors.lilac, textAlign: "center" }]} accessibilityRole="header">
        {q.prompt}
      </Text>
      {q.clues.slice(1, state.revealed).map((c) => (
        <Animated.Text key={c.value} entering={FadeIn} style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>
          💡 {c.value}
        </Animated.Text>
      ))}
      <Animated.View style={[shake, { flexDirection: "row", flexWrap: "wrap", gap, width: size * cols + gap * (cols - 1) }]}>
        {q.options.map((o, i) => (
          <GridTile
            key={o.id}
            index={i}
            size={size}
            label={o.label}
            emoji={o.emoji}
            alt={o.alt}
            state={tileState(o.id)}
            disabled={!!answered || snapshot.status !== "playing"}
            onPress={() => dispatch({ type: "answer", optionId: o.id })}
          />
        ))}
      </Animated.View>
      <HintBar hints={snapshot.hints} onHint={requestHint} />
      {answered && answered.optionId === null ? (
        <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]}>Time's up!</Text>
      ) : null}
      {answered && q.explanation ? (
        <View style={{ paddingHorizontal: spacing.sm }}>
          <Text style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>{q.explanation}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
