import React from "react";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { colors, spacing } from "../../../../theme/colors";
import { type } from "../../../../theme/typography";
import { ClueCard, HintBar, OptionTile, TileState } from "../../../ui/kit";
import { useShake } from "../../../ui/motion";
import type { EngineViewProps } from "../../../ui/types";
import type { QuizAction, QuizState } from "../logic/types";

/** Shared view for the multiple-choice engine family (Guess, Emoji Guess, Odd One Out, Fact/Fake). */
export function QuizView({ state, dispatch, requestHint, snapshot, resolveAsset }: EngineViewProps<QuizState, QuizAction>) {
  const q = state.q;
  const wrongSeq = snapshot.lastOutcome && !snapshot.lastOutcome.correct ? snapshot.lastOutcome.seq : 0;
  const shake = useShake(wrongSeq);
  if (!q) return null;
  const answered = state.answer;

  const tileState = (id: string): TileState => {
    if (state.eliminated.includes(id)) return "eliminated";
    if (!answered) return "idle";
    if (id === q.answerId) return "correct";
    if (id === answered.optionId) return "wrong";
    return "dim";
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.margin, paddingBottom: spacing.lg, gap: spacing.md }} bounces={false}>
      <Text style={[type.bodyLg, { color: colors.lilac, textAlign: "center" }]} accessibilityRole="header">
        {q.prompt}
      </Text>
      <Animated.View style={shake}>
        <ClueCard clues={q.clues} revealed={state.revealed} resolveAsset={resolveAsset} />
      </Animated.View>
      <HintBar hints={snapshot.hints} onHint={requestHint} />
      <View>
        {q.options.map((o, i) => (
          <OptionTile
            key={`${q.id}-${o.id}`}
            index={i}
            label={o.label}
            emoji={o.emoji}
            state={tileState(o.id)}
            disabled={!!answered || snapshot.status !== "playing"}
            onPress={() => dispatch({ type: "answer", optionId: o.id })}
          />
        ))}
      </View>
      {answered && answered.optionId === null ? (
        <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]}>Time's up!</Text>
      ) : null}
      {answered && q.explanation ? (
        <Text style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>{q.explanation}</Text>
      ) : null}
    </ScrollView>
  );
}
