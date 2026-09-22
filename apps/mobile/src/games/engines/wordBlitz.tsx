import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { pickWord } from "../content/words";
import { scoreGuess } from "../logic/scoring";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

export { scoreGuess } from "../logic/scoring";

const KEYS = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");

type Cell = { ch: string; state: "empty" | "tbd" | "correct" | "present" | "absent" };

function emptyRow(): Cell[] {
  return Array.from({ length: 5 }, () => ({ ch: "", state: "empty" as const }));
}

function cellColor(state: Cell["state"]) {
  if (state === "correct") return colors.lime;
  if (state === "present") return "#FFB020";
  if (state === "absent") return colors.cardAlt;
  return colors.card;
}

/** Finite: one 5-letter word, 6 guesses. */
export function WordBlitz({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const answer = useMemo(() => pickWord(), []);
  const [rows, setRows] = useState<Cell[][]>(() => Array.from({ length: 6 }, emptyRow));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const rowRef = useRef(0);
  const colRef = useRef(0);
  const [score, setScore] = useState(0);
  const [finishedBoard, setFinishedBoard] = useState(false);

  function typeChar(ch: string) {
    if (done || finishedBoard || colRef.current >= 5) return;
    const r = rowRef.current;
    const c = colRef.current;
    setRows((prev) => {
      const copy = prev.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
      copy[r][c] = { ch, state: "tbd" };
      rowsRef.current = copy;
      return copy;
    });
    colRef.current = c + 1;
    setCol(c + 1);
  }

  function backspace() {
    if (done || finishedBoard || colRef.current <= 0) return;
    const r = rowRef.current;
    const nextCol = colRef.current - 1;
    setRows((prev) => {
      const copy = prev.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
      copy[r][nextCol] = { ch: "", state: "empty" };
      rowsRef.current = copy;
      return copy;
    });
    colRef.current = nextCol;
    setCol(nextCol);
  }

  function enter() {
    if (done || finishedBoard || colRef.current < 5) return;
    const r = rowRef.current;
    const guess = rowsRef.current[r].map((c) => c.ch).join("");
    const scored = scoreGuess(guess, answer);
    setRows((prev) => {
      const copy = prev.map((rowCells) => rowCells.map((cell) => ({ ...cell })));
      copy[r] = scored;
      rowsRef.current = copy;
      return copy;
    });
    if (guess === answer) {
      const s = (6 - r) * 20;
      setScore(s);
      setFinishedBoard(true);
      finish(s);
      return;
    }
    if (r >= 5) {
      setFinishedBoard(true);
      finish(0);
      return;
    }
    rowRef.current = r + 1;
    colRef.current = 0;
    setRow(r + 1);
    setCol(0);
  }

  return (
    <Shell
      tag={configTag(config, "WORD")}
      title={title}
      score={score}
      subtitle={finishedBoard || done ? `Answer: ${answer}` : `Guess ${row + 1} / 6`}
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
            disabled={done || finishedBoard}
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
              opacity: done || finishedBoard ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold, fontSize: 12 }}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md, justifyContent: "center" }}>
        <Pressable
          disabled={done || finishedBoard}
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
          disabled={done || finishedBoard}
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
