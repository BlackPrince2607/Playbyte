import type { Rng } from "../../../core/rng";

/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;

export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DIR_DELTA: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const DIR_GLYPH = ["↑", "→", "↓", "←"] as const;
export const DIR_NAME = ["up", "right", "down", "left"] as const;

export type Cell = Dir | null;

const isDir = (n: number): n is Dir => n === 0 || n === 1 || n === 2 || n === 3;

/** True when every cell from `i` along `dir` until the edge is empty. The edge itself is a clear exit. */
export function rayClear(cells: readonly Cell[], cols: number, rows: number, i: number, dir: Dir): boolean {
  const [dx, dy] = DIR_DELTA[dir];
  let x = (i % cols) + dx;
  let y = Math.floor(i / cols) + dy;
  while (x >= 0 && y >= 0 && x < cols && y < rows) {
    if (cells[y * cols + x] != null) return false;
    x += dx;
    y += dy;
  }
  return true;
}

/** An arrow can leave when its own direction has an empty ray to the edge. */
export function isFree(cells: readonly Cell[], cols: number, rows: number, i: number): boolean {
  const dir = cells[i];
  return dir != null && rayClear(cells, cols, rows, i, dir);
}

/**
 * Place arrows so the board is always solvable. Each arrow is added only while its exit is empty,
 * so removing them in reverse placement order clears the board.
 */
export function generateBoard(rng: Rng, cols: number, rows: number, fill: number): Cell[] {
  const n = cols * rows;
  const target = Math.max(1, Math.min(n, Math.round(n * fill)));
  const cells: Cell[] = Array.from({ length: n }, (): Cell => null);
  for (let placed = 0; placed < target; placed++) {
    const options: { i: number; dir: Dir }[] = [];
    for (let i = 0; i < n; i++) {
      if (cells[i] != null) continue;
      for (const dir of DIRS) if (rayClear(cells, cols, rows, i, dir)) options.push({ i, dir });
    }
    if (!options.length) break;
    const pick = rng.pick(options);
    cells[pick.i] = pick.dir;
  }
  return cells;
}

/** Remove free arrows until the board is empty. Returns false if some arrow can never leave. */
export function solvable(cells: readonly Cell[], cols: number, rows: number): boolean {
  const board = cells.slice();
  for (let guard = 0; guard <= board.length; guard++) {
    if (board.every((c) => c == null)) return true;
    const i = board.findIndex((_, idx) => isFree(board, cols, rows, idx));
    if (i < 0) return false;
    board[i] = null;
  }
  return false;
}

export function arrowCount(cells: readonly Cell[]): number {
  let n = 0;
  for (const c of cells) if (c != null) n++;
  return n;
}

/** Next board after a clear: denser every time, and one size larger on odd clears, staying square. */
export function nextBoardSize(cols: number, rows: number, fill: number, boardsCleared: number): { cols: number; rows: number; fill: number } {
  const grow = boardsCleared % 2 === 1;
  const next = Math.min(6, Math.max(cols, rows) + (grow ? 1 : 0));
  return {
    cols: next,
    rows: next,
    fill: Math.min(0.8, Math.round((fill + 0.03) * 100) / 100),
  };
}

export function isCell(x: unknown): x is Cell {
  return x === null || (typeof x === "number" && isDir(x));
}
