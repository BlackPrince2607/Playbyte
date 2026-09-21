import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../Shell";
import { pickWord, scramble } from "../content/words";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

/** Endless: unscramble forever; End anytime. */
export function WordScramble({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const [answer, setAnswer] = useState(() => pickWord());
  const [mixed, setMixed] = useState(() => scramble(answer));
  const [guess, setGuess] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  function nextWord(prev?: string) {
    const w = pickWord(prev);
    setAnswer(w);
    setMixed(scramble(w));
    setGuess("");
  }

  function submit() {
    if (guess.trim().toUpperCase() === answer) {
      const ns = streak + 1;
      setStreak(ns);
      setScore((s) => s + 10 * ns);
      nextWord(answer);
    } else {
      setStreak(0);
      setGuess("");
    }
  }

  return (
    <Shell
      tag={configTag(config, "WORD")}
      title={title}
      score={score}
      subtitle={`Streak ${streak} · unscramble`}
      onEnd={() => finish(score)}
    >
      <Text style={[type.largeScore, { color: colors.lime, letterSpacing: 8, marginVertical: spacing.lg }]}>
        {mixed}
      </Text>
      <TextInput
        value={guess}
        onChangeText={setGuess}
        placeholder="Type the word"
        placeholderTextColor={colors.lilac}
        autoCapitalize="characters"
        maxLength={answer.length}
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: spacing.md,
          color: colors.paper,
          fontFamily: fonts.bodyBold,
          letterSpacing: 4,
          textAlign: "center",
          marginBottom: spacing.md,
        }}
      />
      <View style={{ gap: 10 }}>
        <PrimaryButton label="Submit" onPress={submit} />
        <PrimaryButton label="Skip" variant="secondary" onPress={() => { setStreak(0); nextWord(answer); }} />
      </View>
    </Shell>
  );
}
