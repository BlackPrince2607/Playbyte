/** Pure scoring helpers — safe to unit-test without React Native. */

export function normalizeGuess(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type BlitzCell = { ch: string; state: "empty" | "tbd" | "correct" | "present" | "absent" };

export function scoreGuess(guess: string, answer: string): BlitzCell[] {
  const res: BlitzCell[] = guess.split("").map((ch) => ({ ch, state: "absent" as const }));
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

export function scoreCircle(points: { x: number; y: number }[]): number {
  if (points.length < 12) return 0;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
  if (mean < 20) return 0;
  const variance = radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length;
  const cv = Math.sqrt(variance) / mean;
  const first = points[0];
  const last = points[points.length - 1];
  const closure = Math.hypot(first.x - last.x, first.y - last.y) / mean;
  const roundness = Math.max(0, 1 - cv * 2.5);
  const closed = Math.max(0, 1 - closure);
  return Math.round(Math.min(100, (roundness * 0.7 + closed * 0.3) * 100));
}

const GRID = 6;

function pickTargets(n: number, bank: string[]): string[] {
  const pool = [...bank];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map((w) => w.slice(0, Math.min(5, w.length)));
}

function placeWord(grid: string[][], word: string): { cells: [number, number][] } | null {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  for (let a = 0; a < 120; a++) {
    const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
    const r0 = Math.floor(Math.random() * GRID);
    const c0 = Math.floor(Math.random() * GRID);
    const cells: [number, number][] = [];
    let ok = true;
    for (let i = 0; i < word.length; i++) {
      const r = r0 + dr * i;
      const c = c0 + dc * i;
      if (r < 0 || c < 0 || r >= GRID || c >= GRID) {
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

function forcePlace(grid: string[][], word: string, row: number): { cells: [number, number][] } {
  const r = Math.min(row, GRID - 1);
  const cells: [number, number][] = [];
  for (let i = 0; i < word.length && i < GRID; i++) {
    grid[r][i] = word[i];
    cells.push([r, i]);
  }
  return { cells };
}

export function buildPuzzle(wordsToFind: number, bank: string[]) {
  let targets = pickTargets(Math.max(1, wordsToFind), bank);
  for (let attempt = 0; attempt < 8; attempt++) {
    const grid: string[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => ""));
    const placements: { word: string; cells: [number, number][] }[] = [];
    let ok = true;
    for (const word of targets) {
      const placed = placeWord(grid, word);
      if (!placed) {
        ok = false;
        break;
      }
      placements.push({ word, cells: placed.cells });
    }
    if (ok && placements.length === targets.length) {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
        }
      }
      return { grid, placements };
    }
    targets = pickTargets(Math.max(1, wordsToFind), bank);
  }
  const grid: string[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => ""));
  const placements = targets.map((word, i) => ({ word, cells: forcePlace(grid, word, i) }));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
    }
  }
  return { grid, placements };
}

export function isAdjacent(a: [number, number], b: [number, number]) {
  const dr = Math.abs(a[0] - b[0]);
  const dc = Math.abs(a[1] - b[1]);
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

export const SEEDED_GAME_KEYS = [
  "higher_or_lower",
  "memory_sequence",
  "traffic_light",
  "timer_stop",
  "color_match",
  "frenzy_tap",
  "odd_one_out",
  "perfect_circle",
  "bubble_burst",
  "lane_dash",
  "triple_match",
  "flag_rush",
  "emoji_decode",
  "word_scramble",
  "word_blitz",
  "grid_hunt",
] as const;
