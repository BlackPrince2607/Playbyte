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
const PROMPT_FLOOR = 18;

export function promptTextStyle(text: string, opts: { max?: number; crowded?: boolean } = {}) {
  const max = opts.max ?? 30;
  const len = [...text.trim()].length;
  let size = len <= 40 ? max : len <= 80 ? max - 4 : len <= 140 ? max - 8 : max - 10;
  if (opts.crowded) size -= 2;
  const fontSize = Math.max(PROMPT_FLOOR, size);
  return { fontSize, lineHeight: lineHeightFor(text, fontSize) };
}
