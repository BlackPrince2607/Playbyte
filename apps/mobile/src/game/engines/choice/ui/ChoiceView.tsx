import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { promptTextStyle } from "../../../../lib/promptSize";
import { seededCount } from "../../../../lib/seededEngagement";
import { useLanguage } from "../../../../context/LanguageContext";
import { fill } from "../../../../i18n/strings";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import type { EngineViewProps } from "../../../ui/types";
import type { ChoiceAction, ChoiceOption, ChoiceSide, ChoiceState } from "../logic/engine";

type CardProps = {
  option: ChoiceOption;
  pct: number;
  revealed: boolean;
  picked: boolean;
  majority: boolean;
  disabled: boolean;
  onPress: () => void;
};

function SideCard({ option, pct, revealed, picked, majority, disabled, onPress }: CardProps) {
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = revealed ? (prefersReducedMotion() ? pct : withTiming(pct, { duration: 650 })) : 0;
  }, [revealed, pct, fill]);
  const fillStyle = useAnimatedStyle(() => ({ height: `${fill.value}%` }));
  const tint = picked ? colors.limeFill : colors.pinkFill;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={revealed ? `${option.label}, ${pct} percent of the crowd` : option.label}
      accessibilityState={{ disabled, selected: picked }}
      style={({ pressed }) => [
        styles.card,
        { borderColor: picked ? colors.lime : colors.line },
        pressed && !disabled && { transform: [{ scale: 0.97 }], borderColor: colors.lime },
      ]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: tint }, fillStyle]} />
      <Text style={styles.emoji}>{option.emoji ?? "❔"}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {option.label}
      </Text>
      {revealed ? (
        <Animated.Text entering={prefersReducedMotion() ? undefined : FadeIn.duration(300)} style={[styles.pct, { color: majority ? colors.lime : colors.paper }]}>
          {pct}%
        </Animated.Text>
      ) : null}
    </Pressable>
  );
}

export function ChoiceView({ state, dispatch, snapshot }: EngineViewProps<ChoiceState, ChoiceAction>) {
  const { t, fonts: ui } = useLanguage();
  const q = state.q;
  const pick = state.pick;
  useEffect(() => {
    if (!pick) return;
    if (state.mode === "predict") feedback(pick.withCrowd ? "success" : "error");
  }, [pick, state.mode]);
  if (!q) return null;

  const disabled = !!pick || snapshot.status !== "playing";
  const choose = (side: ChoiceSide) => {
    if (disabled) return;
    feedback("select");
    dispatch({ type: "pick", side });
  };
  const pctA = q.split;
  const pctB = 100 - q.split;
  const predict = state.mode === "predict";

  let verdict = "";
  if (pick) {
    if (pick.side === null) verdict = t("timesUp");
    else if (predict) verdict = pick.withCrowd ? t("readCrowd") : t("crowdOther");
    else if (pick.agreePct === 50) verdict = t("perfectSplit");
    else verdict = pick.withCrowd ? fill(t("withPct"), { pct: pick.agreePct }) : fill(t("boldPick"), { pct: pick.agreePct });
  }

  return (
    <View style={styles.root}>
      <Animated.View key={q.id} entering={prefersReducedMotion() ? undefined : FadeInDown.duration(240)} style={{ gap: spacing.md }}>
        <Text style={[type.metadata, { color: colors.lilac, textAlign: "center", letterSpacing: 1, fontFamily: ui.bodyMedium }]}>
          {predict ? t("whatDidMost") : t("pickSide")}
        </Text>
        <Text
          style={[styles.prompt, promptTextStyle(q.prompt, { max: 26 })]}
          accessibilityRole="header"
          numberOfLines={4}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {q.prompt}
        </Text>
        <View style={styles.row}>
          <SideCard option={q.a} pct={pctA} revealed={!!pick} picked={pick?.side === "a"} majority={pctA >= pctB} disabled={disabled} onPress={() => choose("a")} />
          <View style={styles.vs}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <SideCard option={q.b} pct={pctB} revealed={!!pick} picked={pick?.side === "b"} majority={pctB >= pctA} disabled={disabled} onPress={() => choose("b")} />
        </View>
      </Animated.View>
      {pick ? (
        <Animated.View entering={prefersReducedMotion() ? undefined : FadeIn.duration(250)} style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
          <Text style={[type.bodyLg, { color: pick.withCrowd ? colors.lime : predict ? colors.pink : colors.pinkSoft, textAlign: "center", fontFamily: fonts.bodyBold }]}>{verdict}</Text>
          {pick.points > 0 ? <Text style={[type.statsSm, { color: colors.paper, textAlign: "center" }]}>+{pick.points}</Text> : null}
          <Text style={[type.metadata, { color: colors.lilac, textAlign: "center" }]}>
            {`${(q.votes + seededCount(q.id, "votes")).toLocaleString()} votes`}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.lg, gap: spacing.lg },
  prompt: { ...type.gameQuestion, fontSize: 26, lineHeight: 32, color: colors.paper, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "stretch" },
  card: {
    flex: 1,
    minHeight: 220,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    gap: spacing.sm,
    overflow: "hidden",
  },
  fill: { position: "absolute", left: 0, right: 0, bottom: 0 },
  emoji: { fontSize: 64 },
  label: { ...type.button, fontSize: 18, color: colors.paper, textAlign: "center" },
  pct: { fontFamily: fonts.display, fontSize: 32 },
  vs: { width: 36, alignItems: "center", justifyContent: "center" },
  vsText: { fontFamily: fonts.display, fontSize: 16, color: colors.pink },
});
