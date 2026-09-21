import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: complete the shown sequence or miss. */
export function MemorySequence({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const seq = useMemo(() => [0, 1, 2, 3].map(() => Math.floor(Math.random() * 4)), []);
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [phase, setPhase] = useState<"show" | "play">("show");
  const [score, setScore] = useState(0);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (i >= seq.length) {
        clearInterval(id);
        setHighlight(null);
        setPhase("play");
        return;
      }
      setHighlight(seq[i]);
      setTimeout(() => setHighlight(null), 350);
      i += 1;
    }, 550);
    return () => clearInterval(id);
  }, [seq]);

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle={phase === "show" ? "Watch the sequence…" : "Your turn"}
      onEnd={() => finish(score)}
    >
      <Text style={[type.bodyLg, { color: colors.lilac, marginBottom: spacing.md }]}>
        {phase === "show" ? "Memorize…" : "Repeat it"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <GameBtn
            key={i}
            label={String(i + 1)}
            success={highlight === i}
            onPress={() => {
              if (phase !== "play") return;
              if (seq[step] !== i) {
                finish(score);
                return;
              }
              const next = step + 1;
              if (next >= seq.length) {
                const final = seq.length * 10;
                setScore(final);
                finish(final);
                return;
              }
              setStep(next);
              setScore(next * 10);
            }}
          />
        ))}
      </View>
    </Shell>
  );
}
