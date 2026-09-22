import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const PALETTE = [colors.pink, colors.lime, colors.lilac, "#5B8CFF", "#FFB020"];
const COLS = 5;
const ROWS = 6;
const SIZE = 52;

type Cell = { id: number; color: number };

function makeBoard(): Cell[] {
  return Array.from({ length: COLS * ROWS }, (_, id) => ({
    id,
    color: Math.floor(Math.random() * PALETTE.length),
  }));
}

function neighbors(i: number): number[] {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const out: number[] = [];
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

function flood(board: Cell[], start: number): number[] {
  const color = board[start].color;
  const seen = new Set<number>();
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i) || board[i].color !== color) continue;
    seen.add(i);
    for (const n of neighbors(i)) stack.push(n);
  }
  return [...seen];
}

/** Endless: pop groups of 2+ same color; refill; End anytime. */
export function BubbleBurst({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const [board, setBoard] = useState(makeBoard);
  const [score, setScore] = useState(0);

  function tap(i: number) {
    if (done) return;
    const group = flood(board, i);
    if (group.length < 2) return;
    setBoard((prev) =>
      prev.map((cell) =>
        group.includes(cell.id)
          ? { ...cell, color: Math.floor(Math.random() * PALETTE.length) }
          : cell,
      ),
    );
    setScore((s) => s + group.length * 2);
  }

  return (
    <Shell
      tag={configTag(config, "ARCADE")}
      title={title}
      score={score}
      subtitle="Tap matching bubbles (2+)"
      onEnd={() => finish(score)}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {board.map((cell, i) => (
          <Pressable
            key={cell.id}
            disabled={done}
            onPress={() => tap(i)}
            style={{
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              backgroundColor: PALETTE[cell.color],
              borderWidth: 1,
              borderColor: colors.line,
              opacity: done ? 0.5 : 1,
            }}
          />
        ))}
      </View>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md, fontFamily: fonts.body }]}>
        Bigger groups = more points
      </Text>
    </Shell>
  );
}
