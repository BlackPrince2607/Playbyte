import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../../../components/PrimaryButton";
import { useLanguage } from "../../../../context/LanguageContext";
import { fonts } from "../../../../theme/typography";

const LAVENDER = "#F3F0FA";
const PURPLE = "#635BFF";
const INK = "#1C1430";
const MUTED = "#8B849C";
const EMPTY = "#EEEAF6";
const OK = "#2F9E6B";

function MiniCard({ face, faceUp }: { face?: string; faceUp?: boolean }) {
  return (
    <View style={[styles.mini, faceUp ? styles.miniUp : styles.miniDown]}>
      <Text style={styles.miniGlyph}>{faceUp ? face : "?"}</Text>
    </View>
  );
}

export function PairHowTo({ onDone, title }: { onDone: () => void; title?: string }) {
  const { t, fonts: ui } = useLanguage();
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={[styles.kicker, { fontFamily: ui.bodyBold }]}>{title ?? t("pairHowToTitle")}</Text>
        <Text style={[styles.headline, { fontFamily: ui.bodyBold }]}>{t("pairHowToHeadline")}</Text>
        <Text style={[styles.body, { fontFamily: ui.body }]}>{t("pairHowToBody")}</Text>

        <View style={styles.demoRow}>
          <MiniCard face="🦊" faceUp />
          <MiniCard face="🦊" faceUp />
          <MiniCard />
          <MiniCard face="🍕" faceUp />
        </View>
        <Text style={[styles.demoLabel, { color: OK, fontFamily: ui.bodyMedium }]}>{t("pairHowToMatch")}</Text>

        <View style={styles.bullets}>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("pairHowToTip1")}</Text>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("pairHowToTip2")}</Text>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("pairHowToTip3")}</Text>
        </View>

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
  headline: {
    color: INK,
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    lineHeight: 30,
  },
  body: {
    color: MUTED,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  demoRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  mini: {
    width: 44,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  miniDown: { backgroundColor: EMPTY },
  miniUp: { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: OK },
  miniGlyph: { fontSize: 22, lineHeight: 26 },
  demoLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  bullets: { gap: 6, marginTop: 8, marginBottom: 4 },
  bullet: { color: INK, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
