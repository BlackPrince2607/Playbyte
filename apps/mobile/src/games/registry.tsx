import { HigherOrLower } from "./engines/higherOrLower";
import { MemorySequence } from "./engines/memorySequence";
import { TrafficLight } from "./engines/trafficLight";
import { TimerStop } from "./engines/timerStop";
import { ColorMatch } from "./engines/colorMatch";
import { FrenzyTap } from "./engines/frenzyTap";
import { OddOneOut } from "./engines/oddOneOut";
import { PerfectCircle } from "./engines/perfectCircle";
import { BubbleBurst } from "./engines/bubbleBurst";
import { LaneDash } from "./engines/laneDash";
import { TripleMatch } from "./engines/tripleMatch";
import { FlagRush } from "./engines/flagRush";
import { EmojiDecode } from "./engines/emojiDecode";
import { WordScramble } from "./engines/wordScramble";
import { WordBlitz } from "./engines/wordBlitz";
import { GridHunt } from "./engines/gridHunt";
import { SEEDED_GAME_KEYS } from "./logic/scoring";
import { GameProps } from "./types";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import React from "react";
import { Text, View } from "react-native";

const engines = {
  higher_or_lower: HigherOrLower,
  memory_sequence: MemorySequence,
  traffic_light: TrafficLight,
  timer_stop: TimerStop,
  color_match: ColorMatch,
  frenzy_tap: FrenzyTap,
  odd_one_out: OddOneOut,
  perfect_circle: PerfectCircle,
  bubble_burst: BubbleBurst,
  lane_dash: LaneDash,
  triple_match: TripleMatch,
  flag_rush: FlagRush,
  emoji_decode: EmojiDecode,
  word_scramble: WordScramble,
  word_blitz: WordBlitz,
  grid_hunt: GridHunt,
} as const;

export const registry: Record<string, React.ComponentType<GameProps>> = { ...engines };

if (__DEV__) {
  for (const key of SEEDED_GAME_KEYS) {
    if (!registry[key]) console.warn(`[games] Missing engine for seeded key: ${key}`);
  }
}

export function GameEngine(props: GameProps) {
  const Cmp = registry[props.gameKey];
  if (!Cmp) {
    console.warn(`[games] Unknown game key: ${props.gameKey}`);
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, padding: spacing.margin, justifyContent: "center" }}>
        <Text style={[type.gameQuestion, { color: colors.paper }]}>Game unavailable</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
          Unknown key: {props.gameKey}
        </Text>
        <Text
          onPress={() => props.onDone(0, 0)}
          style={[type.bodySm, { color: colors.lime, marginTop: spacing.lg }]}
          accessibilityRole="button"
        >
          Back to feed
        </Text>
      </View>
    );
  }
  return <Cmp {...props} />;
}
