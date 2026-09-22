import React, { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { pickFlagQuestions } from "../content/flags";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: fixed flag questions then complete. */
export function FlagRush({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const total = typeof config?.questions === "number" ? config.questions : 10;
  const questions = useMemo(() => pickFlagQuestions(total), [total]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const locked = useRef(false);
  const q = questions[idx];

  function answer(name: string) {
    if (done || locked.current || !q) return;
    locked.current = true;
    const correct = name === q.name;
    const nextScore = score + (correct ? 10 : 0);
    setScore(nextScore);
    if (idx + 1 >= questions.length) {
      finish(nextScore);
      return;
    }
    setIdx((i) => i + 1);
    locked.current = false;
  }

  if (!q) {
    return (
      <Shell tag={configTag(config, "TRIVIA")} title={title} score={score} onEnd={() => finish(score)}>
        <Text style={[type.bodyLg, { color: colors.lilac }]}>No questions</Text>
      </Shell>
    );
  }

  return (
    <Shell
      tag={configTag(config, "TRIVIA")}
      title={title}
      score={score}
      subtitle={`Question ${idx + 1} / ${questions.length}`}
      onEnd={() => finish(score)}
    >
      <Text style={{ fontSize: 72, textAlign: "center", marginVertical: spacing.lg }}>{q.flag}</Text>
      <Text style={[type.bodyLg, { color: colors.lilac, marginBottom: spacing.md, textAlign: "center" }]}>
        Which country?
      </Text>
      <View style={{ gap: 10 }}>
        {q.options.map((opt) => (
          <GameBtn
            key={opt}
            label={opt}
            disabled={done}
            onPress={() => answer(opt)}
            style={{ alignSelf: "stretch" }}
          />
        ))}
      </View>
    </Shell>
  );
}
