import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

/**
 * Online Random Player categories. Keep pool keys in sync with
 * backend/app/modules/matchmaking/categories.py — the server picks one
 * enabled game from the pool when a match is created so questions/variations rotate.
 */
export type BattleCategoryId =
  | "mixed"
  | "trivia"
  | "emoji"
  | "movies"
  | "music"
  | "arcade"
  | "puzzle"
  | "brain";

export type BattleCategory = {
  id: BattleCategoryId;
  label: string;
  blurb: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Mini-game keys in this lobby. Empty = any enabled game (Mixed). */
  gameKeys: readonly string[];
  accent: string;
  tint: string;
};

export const BATTLE_CATEGORIES: BattleCategory[] = [
  {
    id: "mixed",
    label: "Mixed",
    blurb: "Any game · surprise duel",
    icon: "shuffle",
    gameKeys: [],
    accent: "#bdf532",
    tint: "rgba(189,245,50,0.15)",
  },
  {
    id: "trivia",
    label: "Trivia",
    blurb: "Facts, flags, food & more",
    icon: "globe-outline",
    gameKeys: [
      "fact_fake",
      "fact_fake_india",
      "fact_fake_science",
      "fact_fake_sports",
      "guess_flag",
      "guess_indian_state",
      "guess_food",
      "guess_landmark",
    ],
    accent: "#ffb1c4",
    tint: "rgba(255,177,196,0.2)",
  },
  {
    id: "emoji",
    label: "Emoji",
    blurb: "Movies, songs, words, phrases",
    icon: "happy-outline",
    gameKeys: ["emoji_movie", "emoji_bollywood", "emoji_phrase", "emoji_word", "emoji_song"],
    accent: "#ff4d8d",
    tint: "rgba(255,77,141,0.15)",
  },
  {
    id: "movies",
    label: "Movies",
    blurb: "Filmy emoji & trivia",
    icon: "film",
    gameKeys: ["emoji_movie", "emoji_bollywood", "fact_fake_filmy"],
    accent: "#8F7FC0",
    tint: "rgba(143,127,192,0.2)",
  },
  {
    id: "music",
    label: "Music",
    blurb: "Decode the hit from emoji",
    icon: "musical-notes",
    gameKeys: ["emoji_song"],
    accent: "#ffb1c4",
    tint: "rgba(255,177,196,0.2)",
  },
  {
    id: "arcade",
    label: "Arcade",
    blurb: "Speed, tap & math blitz",
    icon: "game-controller",
    gameKeys: [
      "lane_dash",
      "math_rush",
      "math_check",
      "math_blitz",
      "tap_rush",
      "tap_moles",
      "tap_dont_tap",
      "fruit_frenzy",
      "balloon_pop",
    ],
    accent: "#C6FF3D",
    tint: "rgba(198,255,61,0.15)",
  },
  {
    id: "puzzle",
    label: "Puzzle",
    blurb: "Pairs, mazes, spot & search",
    icon: "grid",
    gameKeys: [
      "find_pair",
      "word_search",
      "word_search_india",
      "spot_shapes",
      "spot_city",
      "maze_runner",
      "connect_dots",
      "arrow_rush",
      "odd_words",
      "odd_emoji",
      "odd_lookalike",
    ],
    accent: "#57e15b",
    tint: "rgba(87,225,91,0.15)",
  },
  {
    id: "brain",
    label: "Brain",
    blurb: "Math, logic & focus",
    icon: "bulb",
    gameKeys: ["math_rush", "math_check", "odd_numbers", "connect_dots", "arrow_rush", "maze_gems"],
    accent: "#bdf532",
    tint: "rgba(189,245,50,0.15)",
  },
];
