import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Trial = { word: string; colI: number; match: boolean };

function makeTrial(words: readonly string[]): Trial {
  const wordI = Math.floor(Math.random() * words.length);
  const colorI = Math.floor(Math.random() * words.length);
  return {
    word: words[wordI],
    colI: colorI,
    match: words[colorI] === words[wordI],
  };
}

/** Finite: several stroop trials to fill maxScore. */
export function ColorMatch({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const words = ["PINK", "LIME", "LILAC"] as const;
  const cols = [colors.pink, colors.lime, colors.lilac];
  const maxScore = typeof config?.maxScore === "number" ? config.maxScore : 40;
  const rounds =
    typeof config?.questions === "number"
      ? Math.max(1, config.questions)
      : Math.max(1, Math.round(maxScore / 10));
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [locked, setLocked] = useState(false);
  const [trial, setTrial] = useState<Trial>(() => makeTrial(words));
  const pointsPer = useMemo(() => Math.floor(maxScore / rounds), [maxScore, rounds]);

  function answer(saidMatch: boolean) {
    if (done || locked) return;
    setLocked(true);
    const gained = saidMatch === trial.match ? pointsPer : 0;
    const nextScore = score + gained;
    setScore(nextScore);
    const nextRound = round + 1;
    if (nextRound >= rounds) {
      finish(nextScore);
      return;
    }
    setRound(nextRound);
    setTrial(makeTrial(words));
    setLocked(false);
  }

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle={`Round ${Math.min(round + 1, rounds)} / ${rounds} · word match ink?`}
      onEnd={() => finish(score)}
    >
      <Text style={[type.gameQuestion, { color: cols[trial.colI], marginVertical: spacing.lg }]}>{trial.word}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <GameBtn label="Match" onPress={() => answer(true)} disabled={done || locked} />
        <GameBtn label="No" onPress={() => answer(false)} disabled={done || locked} />
      </View>
    </Shell>
  );
}
