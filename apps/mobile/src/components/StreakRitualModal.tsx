import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "./PrimaryButton";
import { useLanguage } from "../context/LanguageContext";
import { fill } from "../i18n/strings";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  visible: boolean;
  streak: number;
  busy?: boolean;
  onRemind: () => void;
  onKeepPlaying: () => void;
};

/** Day-0 climax after the first finished game — lock streak + ask for a reminder. */
export function StreakRitualModal({ visible, streak, busy, onRemind, onKeepPlaying }: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();
  const day = Math.max(1, streak);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepPlaying}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onKeepPlaying} accessibilityLabel={t("keepPlaying")} />
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[type.metadata, styles.eyebrow, { fontFamily: ui.bodyBold }]}>
            {t("streakRitualEyebrow")}
          </Text>
          <Text style={[type.bodyLg, styles.title, { fontFamily: ui.display, color: colors.paper }]}>
            {fill(t("streakRitualTitle"), { day })}
          </Text>
          <Text style={[type.bodySm, styles.body, { fontFamily: ui.body }]}>
            {fill(t("streakRitualBody"), { next: day + 1 })}
          </Text>
          <PrimaryButton
            label={busy ? t("saving") : t("remindMeStreak")}
            onPress={onRemind}
            disabled={busy}
            icon="notifications-outline"
          />
          <Pressable
            accessibilityRole="button"
            onPress={onKeepPlaying}
            disabled={busy}
            style={({ pressed }) => [{ paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: ui.bodyBold }]}>
              {t("keepPlaying")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12,8,24,0.72)",
    justifyContent: "center",
    paddingHorizontal: spacing.margin,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  flame: { fontSize: 40, textAlign: "center", marginBottom: spacing.xs },
  eyebrow: { color: colors.lime, letterSpacing: 1, textAlign: "center" },
  title: { textAlign: "center", fontSize: 22, lineHeight: 28 },
  body: { color: colors.lilac, textAlign: "center", marginBottom: spacing.sm, lineHeight: 20 },
});
