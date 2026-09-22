import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const SYMBOLS = ["◆", "●", "▲", "■", "★", "✦"];

type Tile = { id: number; symbol: string };

function deal(n = 9): Tile[] {
  const picks: string[] = [];
  while (picks.length < n) {
    const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const count = picks.filter((p) => p === s).length;
    if (count < 3) picks.push(s);
  }
  // ensure at least one triple possible by forcing 3 of one symbol
  const forced = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  picks[0] = forced;
  picks[1] = forced;
  picks[2] = forced;
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks.map((symbol, id) => ({ id, symbol }));
}

/** Endless: select 3 matching tiles; board refills; End anytime. */
export function TripleMatch({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const [tiles, setTiles] = useState(() => deal());
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  function select(id: number) {
    if (done) return;
    if (picked.includes(id)) {
      setPicked((p) => p.filter((x) => x !== id));
      return;
    }
    const next = [...picked, id];
    if (next.length < 3) {
      setPicked(next);
      return;
    }
    const symbols = next.map((i) => tiles.find((t) => t.id === i)!.symbol);
    const ok = symbols[0] === symbols[1] && symbols[1] === symbols[2];
    if (ok) {
      const ns = streak + 1;
      setStreak(ns);
      setScore((s) => s + 10 * ns);
      setTiles(deal());
      setPicked([]);
    } else {
      setStreak(0);
      setPicked([]);
    }
  }

  return (
    <Shell
      tag={configTag(config, "PUZZLE")}
      title={title}
      score={score}
      subtitle={`Streak ${streak} · pick 3 matching`}
      onEnd={() => finish(score)}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {tiles.map((t) => {
          const on = picked.includes(t.id);
          return (
            <Pressable
              key={t.id}
              disabled={done}
              onPress={() => select(t.id)}
              style={{
                width: 72,
                height: 72,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: on ? colors.lime : colors.line,
                backgroundColor: on ? "rgba(198,255,61,0.15)" : colors.cardAlt,
                alignItems: "center",
                justifyContent: "center",
                opacity: done ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 28, color: colors.paper }}>{t.symbol}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md, fontFamily: fonts.body }]}>
        Wrong trio resets streak
      </Text>
    </Shell>
  );
}
