import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "./PrimaryButton";
import { useLanguage } from "../context/LanguageContext";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

/** WhatsApp brand green — used sparingly for the community CTA. */
const WA_GREEN = "#25D366";
const WA_GREEN_FILL = "rgba(37, 211, 102, 0.14)";
const WA_GREEN_LINE = "rgba(37, 211, 102, 0.35)";

type Props = {
  visible: boolean;
  onJoin: () => void;
  onDismiss: () => void;
};

/** Soft one-time ask to join the community WhatsApp group — shown after a finished game. */
export function WhatsAppGroupModal({ visible, onJoin, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={t("whatsappMaybeLater")} />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconBadge} accessibilityElementsHidden>
            <Ionicons name="logo-whatsapp" size={36} color={WA_GREEN} />
          </View>
          <Text style={[type.metadata, styles.eyebrow, { fontFamily: ui.bodyBold }]}>
            {t("whatsappGroupEyebrow")}
          </Text>
          <Text style={[type.bodyLg, styles.title, { fontFamily: ui.display, color: colors.paper }]}>
            {t("whatsappGroupTitle")}
          </Text>
          <Text style={[type.bodySm, styles.body, { fontFamily: ui.body }]}>{t("whatsappGroupBody")}</Text>
          <PrimaryButton
            label={t("joinWhatsAppGroup")}
            onPress={onJoin}
            icon="logo-whatsapp"
            style={styles.joinBtn}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [{ paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: ui.bodyBold }]}>
              {t("whatsappMaybeLater")}
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
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: WA_GREEN_LINE,
  },
  iconBadge: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: WA_GREEN_FILL,
    borderWidth: 1,
    borderColor: WA_GREEN_LINE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  eyebrow: { color: WA_GREEN, letterSpacing: 2, textAlign: "center" },
  title: { textAlign: "center", fontSize: 24, lineHeight: 32 },
  body: { color: colors.lilac, textAlign: "center", marginBottom: spacing.xs },
  joinBtn: {
    backgroundColor: WA_GREEN,
    shadowColor: WA_GREEN,
  },
});
