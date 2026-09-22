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
  const words = item.config?.wordsToFind;
  if (typeof q === "number") return `${q} rounds`;
  if (typeof levels === "number") return `${levels} puzzles`;
  if (typeof words === "number") return `${words} words`;
  return "One level";
}

export function GameIntroPage({ item, height, onStart }: Props) {
  const tag = tagFrom(item);
  return (
    <View style={[styles.page, { height }]}>
      <LinearGradient colors={["rgba(198,255,61,0.18)", "transparent", colors.ink]} style={StyleSheet.absoluteFill} />
      <View style={styles.glowOrb} />
      <View style={styles.card}>
        <View style={styles.artBand}>
          <Text style={[type.hero, { color: colors.lime, fontSize: 42, opacity: 0.35 }]}>
            {item.title.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={[type.micro, { color: colors.lime, fontFamily: fonts.bodyBold }]}>{tag}</Text>
          </View>
          <LivePill label="IN FEED" />
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
            <Text style={[type.statsSm, { color: colors.paper }]}>Percentile</Text>
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
  glowOrb: {
    position: "absolute",
    top: 80,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(198,255,61,0.12)",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: "hidden",
  },
  artBand: {
    height: 88,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
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
