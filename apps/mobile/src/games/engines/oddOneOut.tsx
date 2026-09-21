import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: pick the odd shape. */
export function OddOneOut({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const [score, setScore] = useState(0);
  const options = useMemo(() => {
    const oddIndex = Math.floor(Math.random() * 4);
    return [0, 1, 2, 3].map((i) => (i === oddIndex ? "▲" : "●"));
  }, []);

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle="Which is different?"
      onEnd={() => finish(score)}
    >
      <Text style={[type.bodyLg, { color: colors.paper, marginVertical: spacing.md }]}>Find the odd one</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {options.map((label, i) => (
          <GameBtn
            key={`${label}-${i}`}
            label={label}
            onPress={() => {
              const s = label === "▲" ? 15 : 0;
              setScore(s);
              finish(s);
            }}
          />
        ))}
      </View>
    </Shell>
  );
}
