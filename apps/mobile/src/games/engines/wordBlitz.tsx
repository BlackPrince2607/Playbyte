import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { pickWord } from "../content/words";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const KEYS = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");

type Cell = { ch: string; state: "empty" | "tbd" | "correct" | "present" | "absent" };

function emptyRow(): Cell[] {
  return Array.from({ length: 5 }, () => ({ ch: "", state: "empty" as const }));
}

function scoreGuess(guess: string, answer: string): Cell[] {
  const res: Cell[] = guess.split("").map((ch) => ({ ch, state: "absent" as const }));
  const remaining = answer.split("");
  guess.split("").forEach((ch, i) => {
    if (ch === answer[i]) {
      res[i].state = "correct";
      remaining[i] = "";
    }
  });
  guess.split("").forEach((ch, i) => {
    if (res[i].state === "correct") return;
    const idx = remaining.indexOf(ch);
    if (idx >= 0) {
      res[i].state = "present";
      remaining[idx] = "";
    }
  });
  return res;
}

function cellColor(state: Cell["state"]) {
  if (state === "correct") return colors.lime;
  if (state === "present") return "#FFB020";
  if (state === "absent") return colors.cardAlt;
  return colors.card;
}

/** Finite: one 5-letter word, 6 guesses. */
export function WordBlitz({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const answer = useMemo(() => pickWord(), []);
  const [rows, setRows] = useState<Cell[][]>(() => Array.from({ length: 6 }, emptyRow));
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  function typeChar(ch: string) {
    if (done || col >= 5) return;
    setRows((prev) => {
      const copy = prev.map((r) => r.map((c) => ({ ...c })));
      copy[row][col] = { ch, state: "tbd" };
      return copy;
    });
    setCol((c) => c + 1);
  }

  function backspace() {
    if (done || col <= 0) return;
    const nextCol = col - 1;
    setRows((prev) => {
      const copy = prev.map((r) => r.map((c) => ({ ...c })));
      copy[row][nextCol] = { ch: "", state: "empty" };
      return copy;
    });
    setCol(nextCol);
  }

  function enter() {
    if (done || col < 5) return;
    const guess = rows[row].map((c) => c.ch).join("");
    const scored = scoreGuess(guess, answer);
    setRows((prev) => {
      const copy = prev.map((r) => r.map((c) => ({ ...c })));
      copy[row] = scored;
      return copy;
    });
    if (guess === answer) {
      const s = (6 - row) * 20;
      setScore(s);
      setDone(true);
      finish(s);
      return;
    }
    if (row >= 5) {
      setDone(true);
      finish(0);
      return;
    }
    setRow((r) => r + 1);
    setCol(0);
  }

  return (
    <Shell
      tag={configTag(config, "WORD")}
      title={title}
      score={score}
      subtitle={done ? `Answer: ${answer}` : `Guess ${row + 1} / 6`}
      onEnd={() => finish(score)}
    >
      <View style={{ gap: 6, alignItems: "center", marginBottom: spacing.md }}>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: 6 }}>
            {r.map((cell, ci) => (
              <View
                key={ci}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: cellColor(cell.state),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: cell.state === "correct" ? colors.ink : colors.paper,
                    fontFamily: fonts.bodyBold,
                    fontSize: 18,
                  }}
                >
                  {cell.ch}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => typeChar(k)}
            style={{
              width: 30,
              height: 40,
              borderRadius: 6,
              backgroundColor: colors.cardAlt,
              borderWidth: 1,
              borderColor: colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold, fontSize: 12 }}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md, justifyContent: "center" }}>
        <Pressable
          onPress={backspace}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.cardAlt,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold }}>DEL</Text>
        </Pressable>
        <Pressable
          onPress={enter}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.lime,
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.bodyBold }}>ENTER</Text>
        </Pressable>
      </View>
    </Shell>
  );
}
