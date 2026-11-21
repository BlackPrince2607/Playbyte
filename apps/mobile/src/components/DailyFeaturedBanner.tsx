import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { FeedGame } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { localizeGame } from "../i18n/games";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  game: FeedGame;
  onPlay: (game: FeedGame) => void;
};

export function DailyFeaturedBanner({ game, onPlay }: Props) {
  const { t, language, fonts: ui } = useLanguage();
  const localized = localizeGame(game, language);

  return (
    <Pressable
      onPress={() => onPlay(game)}
      accessibilityRole="button"
      accessibilityLabel={`${t("todaysChallenge")}: ${localized.title}`}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.88 }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="flash" size={18} color={colors.ink} />
      </View>
      <View style={styles.copy}>
        <Text style={[type.metadata, { color: colors.lime, fontFamily: ui.bodyBold, letterSpacing: 1 }]}>
          {t("todaysChallenge")}
        </Text>
        <Text style={[type.bodyLg, { color: colors.paper, fontFamily: ui.bodyBold }]} numberOfLines={1}>
          {localized.title}
        </Text>
        {localized.blurb ? (
          <Text style={[type.metadata, { color: colors.lilac }]} numberOfLines={1}>
            {localized.blurb}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.lilac} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.margin,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
});
