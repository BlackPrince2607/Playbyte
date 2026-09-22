import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

/** Finite: stop closest to target (default 9.999s). */
export function TimerStop({ title, config, onDone }: GameProps) {
  const { finish, startedAt, done } = useGameSession(onDone);
  const targetMs = typeof config?.targetMs === "number" ? config.targetMs : 9999;
  const [ms, setMs] = useState(0);
  const [score, setScore] = useState(0);
  const stopped = useRef(false);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      if (stopped.current) return;
      setMs(Date.now() - startedAt.current);
    }, 16);
    return () => clearInterval(id);
  }, [startedAt, done]);

  function stop() {
    if (done || stopped.current) return;
    stopped.current = true;
    const elapsed = Date.now() - startedAt.current;
    setMs(elapsed);
    const err = Math.abs(elapsed - targetMs);
    const s = Math.max(0, 1000 - err);
    setScore(s);
    finish(s);
  }

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle={`Stop at ${(targetMs / 1000).toFixed(3)}s`}
      onEnd={() => finish(score)}
    >
      <Text style={[type.largeScore, { color: colors.lime, marginVertical: spacing.lg, fontSize: 48, lineHeight: 52 }]}>
        {(ms / 1000).toFixed(3)}
      </Text>
      <PrimaryButton label="Stop" style={{ marginTop: spacing.lg }} onPress={stop} disabled={done} />
    </Shell>
  );
}
