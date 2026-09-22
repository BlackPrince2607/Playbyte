import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { GameBtn } from "../GameBtn";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: complete the shown sequence or miss. */
export function MemorySequence({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const seq = useMemo(() => [0, 1, 2, 3].map(() => Math.floor(Math.random() * 4)), []);
  const stepRef = useRef(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [phase, setPhase] = useState<"show" | "play">("show");
  const [score, setScore] = useState(0);

  useEffect(() => {
    let i = 0;
    const flashTimers: ReturnType<typeof setTimeout>[] = [];
    const id = setInterval(() => {
      if (i >= seq.length) {
        clearInterval(id);
        setHighlight(null);
        setPhase("play");
        return;
      }
      const pad = seq[i];
      setHighlight(pad);
      flashTimers.push(setTimeout(() => setHighlight((h) => (h === pad ? null : h)), 350));
      i += 1;
    }, 550);
    return () => {
      clearInterval(id);
      flashTimers.forEach(clearTimeout);
    };
  }, [seq]);

  function press(i: number) {
    if (done || phase !== "play") return;
    const current = stepRef.current;
    if (seq[current] !== i) {
      finish(score);
      return;
    }
    const next = current + 1;
    stepRef.current = next;
    if (next >= seq.length) {
      const final = seq.length * 10;
      setScore(final);
      finish(final);
      return;
    }
    setScore(next * 10);
  }

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
            disabled={done || phase !== "play"}
            onPress={() => press(i)}
          />
        ))}
      </View>
    </Shell>
  );
}
