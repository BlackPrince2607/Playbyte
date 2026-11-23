import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "./PrimaryButton";
import { useLanguage } from "../context/LanguageContext";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  visible: boolean;
  onRate: () => void;
  onDismiss: () => void;
};

/** Soft one-time ask to rate on the Play Store — shown after the first finished game. */
export function RateAppModal({ visible, onRate, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={t("rateMaybeLater")} />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconBadge} accessibilityElementsHidden>
            <Ionicons name="star" size={32} color={colors.lime} />
          </View>
          <Text style={[styles.title, { fontFamily: ui.display, color: colors.paper }]}>{t("rateAppTitle")}</Text>
          <Text style={[type.bodySm, styles.body, { fontFamily: ui.body }]}>{t("rateAppBody")}</Text>
          <PrimaryButton label={t("rateOnPlayStore")} onPress={onRate} icon="star-outline" />
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [{ paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: ui.bodyBold }]}>
              {t("rateMaybeLater")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Play Store rating prompt is Android-first; other platforms keep Settings as the entry. */
export function isRatePromptPlatform() {
  return Platform.OS === "android";
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
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: colors.line,
  },
  iconBadge: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(198,255,61,0.14)",
    borderWidth: 1,
    borderColor: "rgba(198,255,61,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    textAlign: "center",
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
  },
  body: { color: colors.lilac, textAlign: "center", marginBottom: spacing.xs },
});
