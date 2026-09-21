export type GameMode = "finite" | "endless";

export type GameConfig = {
  maxScore?: number;
  genre?: string;
  tag?: string;
  mode?: GameMode;
  levels?: number;
  questions?: number;
  wordsToFind?: number;
  [key: string]: unknown;
};

export type GameProps = {
  gameKey: string;
  title: string;
  blurb: string;
  config?: GameConfig;
  onDone: (score: number, durationMs: number) => void;
};

export function configTag(config?: GameConfig, fallback = "GAME"): string {
  const tag = config?.tag ?? config?.genre;
  if (typeof tag === "string" && tag.trim()) return tag.trim().toUpperCase();
  return fallback;
}

export function configMode(config?: GameConfig): GameMode {
  return config?.mode === "endless" ? "endless" : "finite";
}
