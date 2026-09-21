import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { FeedGame } from "../../api";
import { PrimaryButton } from "../../components/PrimaryButton";
import { LivePill } from "../../components/PlayLogo";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  item: FeedGame;
  height: number;
  onStart: () => void;
};

function tagFrom(item: FeedGame): string {
  const tag = item.config?.tag ?? item.config?.genre;
  if (typeof tag === "string" && tag.trim()) return String(tag).toUpperCase();
  return "GAME";
}

function modeLabel(item: FeedGame): string {
  return item.config?.mode === "endless" ? "Endless" : "Finite";
}

function modeHint(item: FeedGame): string {
  if (item.config?.mode === "endless") return "End anytime";
  const q = item.config?.questions;
  const levels = item.config?.levels;
  if (typeof q === "number") return `${q} rounds`;
  if (typeof levels === "number") return `${levels} puzzles`;
  return "One level";
}

export function GameIntroPage({ item, height, onStart }: Props) {
  const tag = tagFrom(item);
  return (
    <View style={[styles.page, { height }]}>
      <LinearGradient colors={["rgba(198,255,61,0.18)", "transparent", colors.ink]} style={StyleSheet.absoluteFill} />
      <View style={styles.card}>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={[type.micro, { color: colors.lime, fontFamily: fonts.bodyBold }]}>{tag}</Text>
          </View>
          <LivePill label="LIVE" />
        </View>
        <Text style={[type.gameQuestion, { color: colors.paper, marginTop: spacing.md }]}>{item.title}</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>{item.blurb}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[type.statsSm, { color: colors.lime }]}>{modeHint(item)}</Text>
            <Text style={[type.micro, { color: colors.lilac }]}>PLAY</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[type.statsSm, { color: colors.pink }]}>{modeLabel(item)}</Text>
            <Text style={[type.micro, { color: colors.lilac }]}>MODE</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[type.statsSm, { color: colors.paper }]}>1vCrowd</Text>
            <Text style={[type.micro, { color: colors.lilac }]}>SCORE</Text>
          </View>
        </View>
        <PrimaryButton
          label="Join Game"
          onPress={onStart}
          trailingIcon="arrow-forward"
          variant="success"
          style={{ marginTop: spacing.xl }}
        />
      </View>
      <Text style={[type.metadata, { color: colors.lilac, textAlign: "center", marginTop: spacing.lg }]}>
        Swipe up for next play
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.margin,
    paddingTop: 100,
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tag: {
    borderWidth: 1,
    borderColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 2,
  },
});
