import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { shareAppInvite } from "../../lib/shareInvite";
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

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: "hand-left-outline",
    title: "Answer a live moment",
    body: "Pick an option on any moment card in your feed.",
  },
  {
    icon: "flame-outline",
    title: "Earn +1 🔥",
    body: "Every moment you answer adds one to your streak.",
  },
  {
    icon: "trophy-outline",
    title: "Hit milestones",
    body: "Keep showing up to reach the next milestone.",
  },
];

export function StreakScreen({ streak, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const target = nextMilestone(streak);
  const progress = Math.min(1, streak / target);

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[styles.inner, { paddingTop: insets.top + spacing.md }]}
    >
      <Pressable onPress={onBack} style={styles.back} hitSlop={12} accessibilityRole="button">
        <Text style={{ color: colors.pinkSoft }}>‹ Back</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.flame}>🔥</Text>
        <Text style={[type.largeScore, { color: colors.lime }]} accessibilityLabel={`Streak ${streak}`}>
          {streak}
        </Text>
        <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 1 }]}>YOUR STREAK</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.progressHead}>
          <Text style={[type.bodySm, { color: colors.paper }]}>Next milestone</Text>
          <Text style={[type.statsSm, { color: colors.pink }]}>
            {streak}/{target}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[type.metadata, { color: colors.lilac }]}>
          {target - streak} more {target - streak === 1 ? "moment" : "moments"} to reach {target} 🔥
        </Text>
      </View>

      <Text style={[type.metadata, styles.section]}>HOW IT WORKS</Text>
      {STEPS.map((s) => (
        <View key={s.title} style={styles.step}>
          <View style={styles.stepIcon}>
            <Ionicons name={s.icon} size={20} color={colors.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.button, { color: colors.paper }]}>{s.title}</Text>
            <Text style={[type.bodySm, { color: colors.lilac }]}>{s.body}</Text>
          </View>
        </View>
      ))}

      <Text style={[type.metadata, { color: colors.lilac, marginTop: spacing.md }]}>
        Your streak is saved on this device.
      </Text>

      <PrimaryButton label="Back to feed" onPress={onBack} style={{ marginTop: spacing.lg }} />
      <PrimaryButton
        label="Invite friends"
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
