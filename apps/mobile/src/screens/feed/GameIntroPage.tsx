import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { FeedGame } from "../../api";
import { PrimaryButton } from "../../components/PrimaryButton";
import { LivePill } from "../../components/MajaLogo";
import { useLanguage } from "../../context/LanguageContext";
import { localizeGame } from "../../i18n/games";
import { fill } from "../../i18n/strings";
import { lineHeightFor } from "../../lib/promptSize";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

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

function modeLabel(item: FeedGame, t: (key: "endless" | "finite") => string): string {
  return item.config?.mode === "endless" ? t("endless") : t("finite");
}

function modeHint(item: FeedGame, t: (key: "endAnytime" | "rounds" | "puzzles" | "wordsCount" | "oneLevel") => string): string {
  if (item.config?.mode === "endless") return t("endAnytime");
  const q = item.config?.questions;
  const levels = item.config?.levels;
  const words = item.config?.wordsToFind;
  if (typeof q === "number") return fill(t("rounds"), { count: q });
  if (typeof levels === "number") return fill(t("puzzles"), { count: levels });
  if (typeof words === "number") return fill(t("wordsCount"), { count: words });
  return t("oneLevel");
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  const { fonts: ui } = useLanguage();
  return (
    <View style={styles.stat}>
      <Text
        style={[type.statsSm, styles.statValue, { color, fontFamily: ui.bodyBold }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      <Text style={[type.micro, styles.statLabel, { fontFamily: ui.bodyMedium }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function GameIntroPage({ item: raw, height, onStart }: Props) {
  const { language, t, fonts: ui } = useLanguage();
  const item = localizeGame(raw, language);
  const tag = tagFrom(item) === "GAME" ? t("gameTag") : tagFrom(item);
  const titleSize = 28;
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
            <Text style={[type.micro, styles.tagText, { color: colors.lime, fontFamily: ui.bodyBold }]} numberOfLines={1}>
              {tag}
            </Text>
          </View>
          <LivePill label={t("inFeed")} />
        </View>
        <Text
          style={[
            type.gameQuestion,
            {
              color: colors.paper,
              marginTop: spacing.md,
              fontFamily: ui.display,
              fontSize: titleSize,
              lineHeight: lineHeightFor(item.title, titleSize),
            },
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {item.title}
        </Text>
        <Text
          style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm, fontFamily: ui.body }]}
          numberOfLines={2}
        >
          {item.blurb}
        </Text>
        <View style={styles.statsRow}>
          <Stat value={modeHint(item, t)} label={t("statPlay")} color={colors.lime} />
          <Stat value={modeLabel(item, t)} label={t("statMode")} color={colors.pink} />
          <Stat value={t("percentile")} label={t("statScore")} color={colors.paper} />
        </View>
        <PrimaryButton
          label={t("joinGame")}
          onPress={onStart}
          trailingIcon="arrow-forward"
          variant="success"
          style={{ marginTop: spacing.xl }}
        />
      </View>
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
    flexShrink: 1,
    maxHeight: "100%",
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
  tagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  tag: {
    borderWidth: 1,
    borderColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 1,
    maxWidth: "70%",
  },
  tagText: { flexShrink: 1 },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  stat: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    gap: 2,
    overflow: "hidden",
  },
  statValue: { textAlign: "center", width: "100%", lineHeight: 20 },
  statLabel: { color: colors.lilac, textAlign: "center", width: "100%" },
});
