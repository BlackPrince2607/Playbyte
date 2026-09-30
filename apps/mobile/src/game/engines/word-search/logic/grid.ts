import type { Rng } from "../../../core/rng";

export type Cell = [number, number];
export type Placement = { word: string; start: Cell; dir: Cell };

/** Directions in the order they unlock with difficulty: forwards first, then diagonals, then reversed. */
export const DIRECTIONS: Cell[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
];

const ALPHABET = "AAAAABBCCDDEEEEEEFFGGHHIIIIIJKLLLMMNNNNOOOOPPQRRRRSSSSTTTTUUVWXYYZ";

/** Upper-cases and strips everything except A-Z ("Gulab Jamun" -> "GULABJAMUN"). */
export const normWord = (s: string) =>
  s
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

export const cellsOf = (p: Placement): Cell[] => Array.from(p.word, (_, i) => [p.start[0] + p.dir[0] * i, p.start[1] + p.dir[1] * i]);
export const endOf = (p: Placement): Cell => [p.start[0] + p.dir[0] * (p.word.length - 1), p.start[1] + p.dir[1] * (p.word.length - 1)];

/** Letters along a straight (row, column or 45° diagonal) selection, or null for other shapes. */
export function lineCells(from: Cell, to: Cell): Cell[] | null {
  const dr = to[0] - from[0];
  const dc = to[1] - from[1];
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const n = Math.max(Math.abs(dr), Math.abs(dc));
  const step: Cell = [Math.sign(dr), Math.sign(dc)];
  return Array.from({ length: n + 1 }, (_, i) => [from[0] + step[0] * i, from[1] + step[1] * i] as Cell);
}

export function countOccurrences(grid: string[], word: string): number {
  const n = grid.length;
  let count = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      for (const [dr, dc] of DIRECTIONS) {
        let k = 0;
        while (k < word.length) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n || grid[rr][cc] !== word[k]) break;
          k++;
        }
        if (k === word.length) count++;
      }
  // Palindromes read the same both ways from the same cells.
  return word === [...word].reverse().join("") ? count / 2 : count;
}

/**
 * WordGridGenerator: places words (longest first) in `size`x`size`, sharing letters where they
 * cross, using only the first `dirCount` directions, then fills the rest so that every placed word
 * occurs exactly once.
 */
export function generateGrid(rng: Rng, words: string[], size: number, dirCount: number, limit = Infinity): { grid: string[]; placed: Placement[] } {
  const dirs = DIRECTIONS.slice(0, Math.max(1, Math.min(8, dirCount)));
  const sorted: string[] = [];
  for (const w of [...new Set(words.map(normWord))].filter((x) => x.length >= 3 && x.length <= size).sort((a, b) => b.length - a.length)) {
    const rev = [...w].reverse().join("");
    // A word inside another (PEN in PENCIL) could never occur exactly once.
    if (!sorted.some((longer) => longer.includes(w) || longer.includes(rev))) sorted.push(w);
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const cells: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
    const placed: Placement[] = [];
    for (const word of sorted) {
      if (placed.length >= limit) break;
      for (let tries = 0; tries < 150; tries++) {
        const dir = rng.pick(dirs);
        const start: Cell = [rng.int(0, size - 1), rng.int(0, size - 1)];
        const p: Placement = { word, start, dir };
        const [er, ec] = endOf(p);
        if (er < 0 || ec < 0 || er >= size || ec >= size) continue;
        const path = cellsOf(p);
        if (!path.every(([r, c], i) => cells[r][c] === null || cells[r][c] === word[i])) continue;
        // Avoid a word lying entirely on top of another.
        if (path.every(([r, c]) => cells[r][c] !== null)) continue;
        path.forEach(([r, c], i) => (cells[r][c] = word[i]));
        placed.push(p);
        break;
      }
    }
    const letters = ALPHABET + placed.map((p) => p.word).join("");
    for (let fill = 0; fill < 6; fill++) {
      const grid = cells.map((row) => row.map((ch) => ch ?? letters[rng.int(0, letters.length - 1)]).join(""));
      if (placed.every((p) => countOccurrences(grid, p.word) === 1)) return { grid, placed };
    }
  }
  // Extremely unlikely: fall back to a deterministic safe layout (one word per row, left to right).
  const rows = sorted.slice(0, Math.min(size, limit));
  const grid = Array.from({ length: size }, (_, r) => (rows[r] ?? "").padEnd(size, "Q").slice(0, size));
  return { grid, placed: rows.map((word, r) => ({ word, start: [r, 0] as Cell, dir: [0, 1] as Cell })) };
}
