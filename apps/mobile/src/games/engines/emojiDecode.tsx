import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../Shell";
import { pickEmojiPuzzles } from "../content/emojiPuzzles";
import { normalizeGuess } from "../logic/scoring";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

export { normalizeGuess } from "../logic/scoring";

/** Finite: fixed emoji puzzles then complete. */
export function EmojiDecode({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const levels = typeof config?.levels === "number" ? config.levels : 5;
  const puzzles = useMemo(() => pickEmojiPuzzles(levels), [levels]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const locked = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const p = puzzles[idx];

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  function submit() {
    if (!p || done || locked.current) return;
    locked.current = true;
    const ok = normalizeGuess(guess) === normalizeGuess(p.answer);
    const nextScore = score + (ok ? 20 : 0);
    setScore(nextScore);
    setFeedback(ok ? "Nice!" : `It was: ${p.answer}`);
    setGuess("");
    advanceTimer.current = setTimeout(() => {
      setFeedback("");
      if (idx + 1 >= puzzles.length) finish(nextScore);
      else {
        setIdx((i) => i + 1);
        locked.current = false;
      }
    }, 700);
  }

  if (!p) {
    return (
      <Shell tag={configTag(config, "WORD")} title={title} score={score} onEnd={() => finish(score)}>
        <Text style={[type.bodyLg, { color: colors.lilac }]}>No puzzles</Text>
      </Shell>
    );
  }

  return (
    <Shell
      tag={configTag(config, "WORD")}
      title={title}
      score={score}
      subtitle={`Puzzle ${idx + 1} / ${puzzles.length} · ${p.hint}`}
      onEnd={() => finish(score)}
    >
      <Text style={{ fontSize: 40, textAlign: "center", marginVertical: spacing.lg }}>{p.emoji}</Text>
      <TextInput
        value={guess}
        onChangeText={setGuess}
        editable={!done && !locked.current}
        placeholder="Your guess"
        placeholderTextColor={colors.lilac}
        autoCapitalize="characters"
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: spacing.md,
          color: colors.paper,
          fontFamily: fonts.body,
          marginBottom: spacing.md,
        }}
      />
      <PrimaryButton label="Check" onPress={submit} disabled={done} />
      {feedback ? (
        <Text style={[type.bodySm, { color: colors.lime, marginTop: spacing.md }]}>{feedback}</Text>
      ) : null}
    </Shell>
  );
}
