import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Shell } from "../Shell";
import { FIVE_LETTER_WORDS } from "../content/words";
import { GameProps, configTag } from "../types";
import { useGameSession } from "../useGameSession";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const SIZE = 6;

function pickTargets(n: number): string[] {
  const pool = [...FIVE_LETTER_WORDS].sort(() => Math.random() - 0.5);
  return pool.slice(0, n).map((w) => w.slice(0, Math.min(5, w.length)));
}

function placeWord(
  grid: string[][],
  word: string,
): { cells: [number, number][] } | null {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  const attempts = 40;
  for (let a = 0; a < attempts; a++) {
    const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
    const r0 = Math.floor(Math.random() * SIZE);
    const c0 = Math.floor(Math.random() * SIZE);
    const cells: [number, number][] = [];
    let ok = true;
    for (let i = 0; i < word.length; i++) {
      const r = r0 + dr * i;
      const c = c0 + dc * i;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) {
        ok = false;
        break;
      }
      const cur = grid[r][c];
      if (cur && cur !== word[i]) {
        ok = false;
        break;
      }
      cells.push([r, c]);
    }
    if (!ok) continue;
    cells.forEach(([r, c], i) => {
      grid[r][c] = word[i];
    });
    return { cells };
  }
  return null;
}

function buildPuzzle(wordsToFind: number) {
  const targets = pickTargets(wordsToFind);
  const grid: string[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ""));
  const placements: { word: string; cells: [number, number][] }[] = [];
  for (const word of targets) {
    const placed = placeWord(grid, word);
    if (placed) placements.push({ word, cells: placed.cells });
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
    }
  }
  return { grid, placements };
}

function keyOf(r: number, c: number) {
  return `${r},${c}`;
}

/** Finite: find N words in a 6×6 grid. */
export function GridHunt({ title, config, onDone }: GameProps) {
  const { finish } = useGameSession(onDone);
  const wordsToFind = typeof config?.wordsToFind === "number" ? config.wordsToFind : 2;
  const puzzle = useMemo(() => buildPuzzle(wordsToFind), [wordsToFind]);
  const [path, setPath] = useState<[number, number][]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const foundSet = useMemo(() => new Set(found), [found]);

  function toggleCell(r: number, c: number) {
    const k = keyOf(r, c);
    const exists = path.some(([pr, pc]) => keyOf(pr, pc) === k);
    if (exists) {
      setPath((p) => p.filter(([pr, pc]) => keyOf(pr, pc) !== k));
      return;
    }
    const next = [...path, [r, c] as [number, number]];
    setPath(next);
    const spelling = next.map(([nr, nc]) => puzzle.grid[nr][nc]).join("");
    const match = puzzle.placements.find((p) => p.word === spelling && !foundSet.has(p.word));
    if (match) {
      const nextFound = [...found, match.word];
      const nextScore = score + 25;
      setFound(nextFound);
      setScore(nextScore);
      setPath([]);
      if (nextFound.length >= puzzle.placements.length) {
        finish(nextScore);
      }
    }
  }

  return (
    <Shell
      tag={configTag(config, "WORD")}
      title={title}
      score={score}
      subtitle={`Find ${puzzle.placements.map((p) => p.word).join(", ")}`}
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
