import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { shareAppInvite } from "../../lib/shareInvite";
import { useLanguage } from "../../context/LanguageContext";
import { fill } from "../../i18n/strings";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  streak: number;
  onBack: () => void;
};

const MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000];

function nextMilestone(streak: number) {
  return MILESTONES.find((m) => m > streak) ?? Math.ceil((streak + 1) / 1000) * 1000;
}

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: "streakStep1Title" | "streakStep2Title" | "streakStep3Title"; body: "streakStep1Body" | "streakStep2Body" | "streakStep3Body" }[] = [
  { icon: "hand-left-outline", title: "streakStep1Title", body: "streakStep1Body" },
  { icon: "flame-outline", title: "streakStep2Title", body: "streakStep2Body" },
  { icon: "trophy-outline", title: "streakStep3Title", body: "streakStep3Body" },
];

export function StreakScreen({ streak, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();
  const target = nextMilestone(streak);
  const progress = Math.min(1, streak / target);

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[styles.inner, { paddingTop: insets.top + spacing.md }]}
    >
      <Pressable onPress={onBack} style={styles.back} hitSlop={12} accessibilityRole="button">
        <Text style={{ color: colors.pinkSoft, fontFamily: ui.body }}>{t("back")}</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.flame}>🔥</Text>
        <Text style={[type.largeScore, { color: colors.lime }]} accessibilityLabel={fill(t("streakA11y"), { count: streak })}>
          {streak}
        </Text>
        <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 1, fontFamily: ui.bodyMedium }]}>{t("yourStreak")}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.progressHead}>
          <Text style={[type.bodySm, { color: colors.paper, fontFamily: ui.body }]}>{t("nextMilestone")}</Text>
          <Text style={[type.statsSm, { color: colors.pink }]}>
            {streak}/{target}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[type.metadata, { color: colors.lilac, fontFamily: ui.body }]}>
          {fill(t("moreToReach"), {
            count: target - streak,
            unit: target - streak === 1 ? t("dayUnit") : t("daysUnit"),
            target,
          })}{" "}
          🔥
        </Text>
      </View>

      <Text style={[type.metadata, styles.section, { fontFamily: ui.bodyMedium }]}>{t("howItWorks")}</Text>
      {STEPS.map((s) => (
        <View key={s.title} style={styles.step}>
          <View style={styles.stepIcon}>
            <Ionicons name={s.icon} size={20} color={colors.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.button, { color: colors.paper, fontFamily: ui.bodyBold }]}>{t(s.title)}</Text>
            <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{t(s.body)}</Text>
          </View>
        </View>
      ))}

      <Text style={[type.metadata, { color: colors.lilac, marginTop: spacing.md, fontFamily: ui.body }]}>
        {t("streakSaved")}
      </Text>

      <PrimaryButton label={t("backToFeed")} onPress={onBack} style={{ marginTop: spacing.lg }} />
      <PrimaryButton
        label={t("inviteFriends")}
        variant="secondary"
        icon="person-add-outline"
        onPress={() => void shareAppInvite()}
        style={{ marginTop: spacing.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { padding: spacing.margin, paddingBottom: 100, maxWidth: 480, width: "100%", alignSelf: "center" },
  back: { marginBottom: spacing.md, alignSelf: "flex-start" },
  hero: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.lg },
  flame: { fontSize: 48 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.cardAlt, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.lime },
  section: { color: colors.lilac, letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
});
