/** Shared game UI building blocks (answer tiles, hint bar, clue card) used across engine views. */
import React, { createContext, useContext } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { hintCoinCost } from "../../lib/economy";
import type { Hint } from "../core/types";
import { feedback, prefersReducedMotion } from "./feedback";

export type TileState = "idle" | "correct" | "wrong" | "dim" | "eliminated";

export function OptionTile({
  label,
  emoji,
  state = "idle",
  disabled,
  onPress,
  index,
  compact,
}: {
  label: string;
  emoji?: string;
  state?: TileState;
  disabled?: boolean;
  onPress: () => void;
  index?: number;
  /** Feed card: shorter tiles so the page fits without scrolling. */
  compact?: boolean;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || state === "eliminated";
  return (
    <Animated.View
      entering={prefersReducedMotion() ? undefined : FadeInDown.delay((index ?? 0) * 45).duration(220)}
      style={[anim, state === "eliminated" && { opacity: 0.25 }, state === "dim" && { opacity: 0.55 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off, selected: state === "correct" }}
        disabled={off}
        onPress={() => {
          if (!prefersReducedMotion()) scale.value = withSequence(withTiming(0.96, { duration: 60 }), withSpring(1));
          feedback("tap");
          onPress();
        }}
        style={({ pressed }) => [
          styles.tile,
          compact && styles.tileCompact,
          state === "correct" && styles.correct,
          state === "wrong" && styles.wrong,
          pressed && !off && { borderColor: colors.lime },
        ]}
      >
        <Text
          style={[type.bodyLg, styles.tileLabel, (state === "correct" || state === "wrong") && { color: colors.ink }]}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          {emoji ? `${emoji}  ` : ""}
          {label}
        </Text>
        {state === "correct" ? <Text style={styles.mark}>✓</Text> : state === "wrong" ? <Text style={styles.mark}>✕</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/** Square-ish card for grid layouts: big emoji and/or a label. */
export function GridTile({
  label,
  emoji,
  alt,
  state = "idle",
  disabled,
  onPress,
  size,
  index,
}: {
  label: string;
  emoji?: string;
  alt?: string;
  state?: TileState;
  disabled?: boolean;
  onPress: () => void;
  size: number;
  index?: number;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || state === "eliminated";
  const emojiOnly = !!emoji && !label;
  return (
    <Animated.View
      entering={prefersReducedMotion() ? undefined : FadeInDown.delay((index ?? 0) * 30).duration(200)}
      style={[anim, { width: size }, state === "eliminated" && { opacity: 0.2 }, state === "dim" && { opacity: 0.55 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label || alt || emoji}
        accessibilityState={{ disabled: off, selected: state === "correct" }}
        disabled={off}
        onPress={() => {
          if (!prefersReducedMotion()) scale.value = withSequence(withTiming(0.93, { duration: 60 }), withSpring(1));
          feedback("tap");
          onPress();
        }}
        style={({ pressed }) => [
          styles.gridTile,
          { height: emojiOnly ? size : Math.max(72, size * 0.72) },
          state === "correct" && styles.correct,
          state === "wrong" && styles.wrong,
          pressed && !off && { borderColor: colors.lime },
        ]}
      >
        {emoji ? <Text style={{ fontSize: emojiOnly ? Math.min(56, size * 0.5) : 30, lineHeight: emojiOnly ? Math.min(66, size * 0.6) : 36 }}>{emoji}</Text> : null}
        {label ? (
          <Text
            style={[type.bodySm, styles.gridLabel, (state === "correct" || state === "wrong") && { color: colors.ink }]}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export type HintPrices = {
  engine: string;
  freeLeft: number;
  freeText: string;
  coinText: (cost: number) => string;
};

export const HintPriceContext = createContext<HintPrices | null>(null);

export function HintBar({ hints, onHint }: { hints: Hint[]; onHint: (id: string) => void }) {
  const prices = useContext(HintPriceContext);
  if (!hints.length) return null;
  return (
    <View style={styles.hintRow}>
      {hints.map((h) => {
        const coinCost = prices ? hintCoinCost(prices.engine, h.id) : null;
        const tag =
          prices && coinCost != null ? (prices.freeLeft > 0 ? prices.freeText : prices.coinText(coinCost)) : null;
        const paid = tag != null && tag !== prices?.freeText;
        return (
          <Pressable
            key={h.id}
            onPress={() => {
              feedback("select");
              onHint(h.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={tag ? `${h.label}, ${tag}` : `${h.label}${h.cost ? `, costs ${h.cost} points` : ""}`}
            hitSlop={6}
            style={styles.hint}
          >
            <Text style={[type.metadata, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
              💡 {h.label}
              {tag ? <Text style={{ color: paid ? colors.lilac : colors.lime }}>{`  ${tag}`}</Text> : null}
              {!tag && h.cost ? <Text style={{ color: colors.lilac }}>{`  −${h.cost}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type ClueView = { kind: "emoji" | "text" | "image"; value: string; alt?: string };

/** Emoji/image hero plus progressively revealed text clues. */
export function ClueCard({
  clues,
  revealed,
  resolveAsset,
  compact,
}: {
  clues: ClueView[];
  revealed: number;
  resolveAsset: (u: string) => string;
  /** Feed card: shorter clue block so options fit without scrolling. */
  compact?: boolean;
}) {
  const visible = clues.slice(0, Math.max(1, revealed));
  const hero = visible.find((c) => c.kind !== "text");
  const texts = visible.filter((c) => c.kind === "text");
  const emojiSize =
    hero?.kind === "emoji"
      ? compact
        ? [...hero.value].length <= 2
          ? 56
          : [...hero.value].length <= 4
            ? 44
            : 36
        : [...hero.value].length <= 2
          ? 96
          : [...hero.value].length <= 4
            ? 72
            : 52
      : 0;
  return (
    <View style={[styles.clueCard, compact && styles.clueCardCompact]}>
      {hero?.kind === "emoji" ? (
        <Text style={{ fontSize: emojiSize, lineHeight: emojiSize * 1.2, textAlign: "center" }} accessibilityLabel="Emoji clue">
          {hero.value}
        </Text>
      ) : hero?.kind === "image" ? (
        <Image source={{ uri: resolveAsset(hero.value) }} style={styles.clueImage} resizeMode="contain" accessibilityLabel={hero.alt ?? "Image clue"} />
      ) : null}
      {texts.map((c, i) => (
        <Animated.View key={`${i}-${c.value}`} entering={prefersReducedMotion() ? undefined : FadeInDown.duration(260)} style={styles.clueLine}>
          <Text style={[compact ? type.bodySm : type.bodyLg, { color: colors.paper, textAlign: "center" }]}>{c.value}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 56,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.margin,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  tileCompact: {
    minHeight: 44,
    paddingVertical: 10,
    marginBottom: spacing.xs,
  },
  correct: { backgroundColor: colors.lime, borderColor: colors.lime },
  wrong: { backgroundColor: colors.pink, borderColor: colors.pink },
  tileLabel: { color: colors.paper, fontFamily: fonts.bodyBold, flex: 1 },
  mark: { color: colors.ink, fontSize: 18, fontWeight: "700", marginLeft: spacing.sm },
  gridTile: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    gap: 2,
  },
  gridLabel: { color: colors.paper, fontFamily: fonts.bodyBold, textAlign: "center" },
  hintRow: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xs },
  hint: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  clueCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
    gap: spacing.sm,
  },
  clueCardCompact: {
    padding: spacing.sm,
    minHeight: 72,
    gap: spacing.xs,
  },
  clueImage: { width: "100%", aspectRatio: 16 / 10, borderRadius: radius.md },
  clueLine: { paddingVertical: 2 },
});
