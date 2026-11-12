const INDIC = /[\u0900-\u0DFF]/;

/** Scripts like Devanagari carry marks above and below the line, so they need extra line height to avoid clipping. */
export function lineHeightFor(text: string, fontSize: number): number {
  return Math.round(fontSize * (INDIC.test(text) ? 1.5 : 1.2));
}

/**
 * Font size for a question so it fits alongside its answers on one screen.
 * `crowded` drops a step when an image or many options compete for space.
 */
/** Smallest prompt size that stays readable on a phone feed card. */
const PROMPT_FLOOR = 20;

export function promptTextStyle(text: string, opts: { max?: number; crowded?: boolean } = {}) {
  const max = opts.max ?? 30;
  const len = [...text.trim()].length;
  // Keep steps gentle — answer rows need space more than the question needs to grow.
  let size = len <= 40 ? max : len <= 70 ? max - 2 : len <= 100 ? max - 4 : max - 6;
  if (opts.crowded) size -= 2;
  const fontSize = Math.max(PROMPT_FLOOR, size);
  return { fontSize, lineHeight: lineHeightFor(text, fontSize) };
}
