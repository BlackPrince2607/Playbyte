import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../../../components/PrimaryButton";
import { useLanguage } from "../../../../context/LanguageContext";
import { fonts } from "../../../../theme/typography";

const LAVENDER = "#F3F0FA";
const PURPLE = "#635BFF";
const INK = "#1C1430";
const MUTED = "#8B849C";
const OK = "#2F9E6B";

export function MazeHowTo({ onDone, title }: { onDone: () => void; title?: string }) {
  const { t, fonts: ui } = useLanguage();
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={[styles.kicker, { fontFamily: ui.bodyBold }]}>{title ?? t("mazeHowToTitle")}</Text>
        <Text style={[styles.headline, { fontFamily: ui.bodyBold }]}>{t("mazeHowToHeadline")}</Text>
        <Text style={[styles.body, { fontFamily: ui.body }]}>{t("mazeHowToBody")}</Text>
        <View style={styles.bullets}>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("mazeHowToTip1")}</Text>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("mazeHowToTip2")}</Text>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("mazeHowToTip3")}</Text>
        </View>
        <Text style={[styles.demoLabel, { fontFamily: ui.bodyMedium }]}>{t("mazeHowToDemo")}</Text>
        <PrimaryButton label={t("arrowHowToPlay")} onPress={onDone} variant="success" style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(28, 20, 48, 0.72)",
    justifyContent: "center",
    paddingHorizontal: 20,
    zIndex: 20,
  },
  card: {
    backgroundColor: LAVENDER,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 10,
  },
  kicker: {
    color: PURPLE,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  headline: { color: INK, fontFamily: fonts.bodyBold, fontSize: 24, lineHeight: 30 },
  body: { color: MUTED, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginBottom: 4 },
  bullets: { gap: 6, marginTop: 4, marginBottom: 4 },
  bullet: { color: INK, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  demoLabel: { color: OK, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
});
