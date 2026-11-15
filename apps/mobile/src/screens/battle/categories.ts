import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

export type BattleCategoryId =
  | "mixed"
  | "movies"
  | "music"
  | "arcade"
  | "puzzle"
  | "brain"
  | "gk"
  | "culture";

export type BattleCategory = {
  id: BattleCategoryId;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Omit for “any enabled game” queue. */
  gameKey?: string;
  accent: string;
  tint: string;
};

/** Stitch “Choose a game” grid — maps themes onto matchmaking game keys. */
export const BATTLE_CATEGORIES: BattleCategory[] = [
  {
    id: "mixed",
    label: "Mixed",
    icon: "shuffle",
    accent: "#bdf532",
    tint: "rgba(189,245,50,0.15)",
  },
  {
    id: "movies",
    label: "Movies",
    icon: "film",
    gameKey: "emoji_movie",
    accent: "#ff4d8d",
    tint: "rgba(255,77,141,0.15)",
  },
  {
    id: "music",
    label: "Music",
    icon: "musical-notes",
    gameKey: "emoji_song",
    accent: "#ffb1c4",
    tint: "rgba(255,177,196,0.2)",
  },
  {
    id: "arcade",
    label: "Arcade",
    icon: "game-controller",
    gameKey: "lane_dash",
    accent: "#C6FF3D",
    tint: "rgba(198,255,61,0.15)",
  },
  {
    id: "puzzle",
    label: "Puzzle",
    icon: "grid",
    gameKey: "find_pair",
    accent: "#8F7FC0",
    tint: "rgba(143,127,192,0.2)",
  },
  {
    id: "brain",
    label: "Brain",
    icon: "bulb",
    gameKey: "math_rush",
    accent: "#57e15b",
    tint: "rgba(87,225,91,0.15)",
  },
  {
    id: "gk",
    label: "GK",
    icon: "globe-outline",
    gameKey: "fact_fake",
    accent: "#ffb1c4",
    tint: "rgba(255,177,196,0.2)",
  },
  {
    id: "culture",
    label: "Culture",
    icon: "happy-outline",
    gameKey: "fact_fake_filmy",
    accent: "#bdf532",
    tint: "rgba(189,245,50,0.15)",
  },
];
