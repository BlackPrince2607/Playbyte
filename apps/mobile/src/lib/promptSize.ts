const INDIC = /[\u0900-\u0DFF]/;

/** Scripts like Devanagari carry marks above and below the line, so they need extra line height to avoid clipping. */
export function lineHeightFor(text: string, fontSize: number): number {
  return Math.round(fontSize * (INDIC.test(text) ? 1.5 : 1.2));
}

/**
 * Font size for a question so it fits alongside its answers on one screen.
 * `crowded` drops a step when an image or many options compete for space.
 */
export function promptTextStyle(text: string, opts: { max?: number; crowded?: boolean } = {}) {
  const max = opts.max ?? 30;
  const len = [...text.trim()].length;
  let size = len <= 40 ? max : len <= 80 ? max - 6 : len <= 140 ? max - 10 : max - 12;
  if (opts.crowded) size -= 4;
  const fontSize = Math.max(16, size);
  return { fontSize, lineHeight: lineHeightFor(text, fontSize) };
}
