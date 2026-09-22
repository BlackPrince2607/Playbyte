import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { FIVE_LETTER_WORDS } from "../content/words";
import { buildPuzzle, isAdjacent } from "../logic/scoring";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

export { buildPuzzle } from "../logic/scoring";

function keyOf(r: number, c: number) {
  return `${r},${c}`;
}

/** Finite: find N words in a 6×6 grid. */
export function GridHunt({ title, config, onDone }: GameProps) {
  const { finish, done } = useGameSession(onDone);
  const wordsToFind = typeof config?.wordsToFind === "number" ? config.wordsToFind : 2;
  const puzzle = useMemo(() => buildPuzzle(wordsToFind, FIVE_LETTER_WORDS), [wordsToFind]);
  const [path, setPath] = useState<[number, number][]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const foundRef = useRef<Set<string>>(new Set());
  const scoreRef = useRef(0);

  function toggleCell(r: number, c: number) {
    if (done) return;
    setPath((prev) => {
      const k = keyOf(r, c);
      const exists = prev.some(([pr, pc]) => keyOf(pr, pc) === k);
      if (exists) return prev.filter(([pr, pc]) => keyOf(pr, pc) !== k);
      const nextCell: [number, number] = [r, c];
      if (prev.length && !isAdjacent(prev[prev.length - 1], nextCell)) return prev;
      const next = [...prev, nextCell];
      const spelling = next.map(([nr, nc]) => puzzle.grid[nr][nc]).join("");
      const match = puzzle.placements.find((p) => p.word === spelling && !foundRef.current.has(p.word));
      if (match) {
        foundRef.current.add(match.word);
        const nextFound = [...foundRef.current];
        const nextScore = scoreRef.current + 50;
        scoreRef.current = nextScore;
        setFound(nextFound);
        setScore(nextScore);
        if (nextFound.length >= puzzle.placements.length) finish(nextScore);
        return [];
      }
      return next;
    });
  }

  return (
    <Shell
      tag={configTag(config, "WORD")}
      title={title}
      score={score}
      subtitle={`Find ${puzzle.placements.length} hidden words · ${found.length}/${puzzle.placements.length}`}
      onEnd={() => finish(score)}
    >
      <View style={{ gap: 4, alignItems: "center" }}>
        {puzzle.grid.map((row, r) => (
          <View key={r} style={{ flexDirection: "row", gap: 4 }}>
            {row.map((ch, c) => {
              const on = path.some(([pr, pc]) => pr === r && pc === c);
              return (
                <Pressable
                  key={c}
                  disabled={done}
                  onPress={() => toggleCell(r, c)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: on ? colors.lime : colors.line,
                    backgroundColor: on ? "rgba(198,255,61,0.2)" : colors.cardAlt,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: done ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold }}>{ch}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>
        Found: {found.length ? found.join(", ") : "—"}
      </Text>
    </Shell>
  );
}
