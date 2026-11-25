import React, { useState } from "react";
import { LayoutChangeEvent, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLanguage } from "../../../../context/LanguageContext";
import { localizeChrome } from "../../../../i18n/chrome";
import { colors, spacing } from "../../../../theme/colors";
import { type } from "../../../../theme/typography";
import { GridTile, HintBar, TileState } from "../../../ui/kit";
import { useShake } from "../../../ui/motion";
import type { EngineViewProps } from "../../../ui/types";
import type { QuizAction, QuizState } from "../../quiz/logic/types";

const columnsFor = (n: number, textual: boolean) => (n <= 4 ? 2 : n <= 6 ? (textual ? 2 : 3) : n <= 9 ? 3 : 4);

/** Card-grid presentation of a quiz question (Odd One Out). */
export function OddGridView({
  state,
  dispatch,
  requestHint,
  snapshot,
  compact,
  hideHints,
}: EngineViewProps<QuizState, QuizAction>) {
  const { language } = useLanguage();
  const { width: windowW } = useWindowDimensions();
  const [hostW, setHostW] = useState(0);
  const q = state.q;
  const wrongSeq = snapshot.lastOutcome && !snapshot.lastOutcome.correct ? snapshot.lastOutcome.seq : 0;
  const shake = useShake(wrongSeq);
  if (!q) return null;
  const answered = state.answer;
  const textual = q.options.some((o) => o.label);
  const cols = columnsFor(q.options.length, textual);
  const gap = compact ? spacing.xs : spacing.sm;
  const widthBudget = compact
    ? hostW > 0
      ? hostW
      : Math.min(windowW, 520) - spacing.margin * 2
    : Math.min(windowW, 520) - spacing.margin * 2;
  const size = Math.max(56, Math.floor((widthBudget - gap * (cols - 1)) / cols));

  const tileState = (id: string): TileState => {
    if (state.eliminated.includes(id)) return "eliminated";
    if (!answered) return "idle";
    if (id === q.answerId) return "correct";
    if (id === answered.optionId) return "wrong";
    return "dim";
  };

  const onHostLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - hostW) > 1) setHostW(next);
  };

  const body = (
    <>
      <Text style={[type.bodyLg, { color: colors.lilac, textAlign: "center" }]} accessibilityRole="header">
        {localizeChrome(q.prompt, language)}
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
      {hideHints ? null : <HintBar hints={snapshot.hints} onHint={requestHint} />}
      {answered && answered.optionId === null ? (
        <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]}>Time's up!</Text>
      ) : null}
      {answered && q.explanation ? (
        <View style={{ paddingHorizontal: spacing.sm }}>
          <Text style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>{q.explanation}</Text>
        </View>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <View
        onLayout={onHostLayout}
        style={{ flex: 1, minHeight: 0, gap: spacing.sm, alignItems: "center", justifyContent: "center" }}
      >
        {body}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: spacing.margin,
        paddingBottom: spacing.lg,
        gap: spacing.md,
        alignItems: "center",
      }}
      bounces={false}
    >
      {body}
    </ScrollView>
  );
}
