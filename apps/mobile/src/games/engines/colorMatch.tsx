import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: one stroop trial. */
export function ColorMatch({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const words = ["PINK", "LIME", "LILAC"] as const;
  const cols = [colors.pink, colors.lime, colors.lilac];
  const [score, setScore] = useState(0);
  const { word, colI, match } = useMemo(() => {
    const wordI = Math.floor(Math.random() * words.length);
    const colorI = Math.floor(Math.random() * cols.length);
    return {
      word: words[wordI],
      colI: colorI,
      match: words[colorI] === words[wordI],
    };
  }, []);

  function answer(saidMatch: boolean) {
    const s = saidMatch === match ? 10 : 0;
    setScore(s);
    finish(s);
  }

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle="Does the word match the ink color?"
      onEnd={() => finish(score)}
    >
      <Text style={[type.gameQuestion, { color: cols[colI], marginVertical: spacing.lg }]}>{word}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <GameBtn label="Match" onPress={() => answer(true)} />
        <GameBtn label="No" onPress={() => answer(false)} />
      </View>
    </Shell>
  );
}
