import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: stop closest to 9.999s. */
export function TimerStop({ title, config, onDone }: GameProps) {
  const { finish, startedAt } = useGameSession(onDone);
  const [ms, setMs] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setMs(Date.now() - startedAt.current), 16);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle="Stop at 9.999s"
      onEnd={() => finish(score)}
    >
      <Text style={[type.largeScore, { color: colors.lime, marginVertical: spacing.lg, fontSize: 48, lineHeight: 52 }]}>
        {(ms / 1000).toFixed(3)}
      </Text>
      <PrimaryButton
        label="Stop"
        style={{ marginTop: spacing.lg }}
        onPress={() => {
          const err = Math.abs(ms - 9999);
          const s = Math.max(0, 1000 - err);
          setScore(s);
          finish(s);
        }}
      />
    </Shell>
  );
}
