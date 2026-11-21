import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../../../components/PrimaryButton";
import { useLanguage } from "../../../../context/LanguageContext";
import { fonts } from "../../../../theme/typography";

const LAVENDER = "#F3F0FA";
const PURPLE = "#635BFF";
const INK = "#1C1430";
const MUTED = "#8B849C";
const LIME = "#C6FF3D";
const PINK = "#FF4D8D";

export function LaneHowTo({ onDone, title }: { onDone: () => void; title?: string }) {
  const { t, fonts: ui } = useLanguage();
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={[styles.kicker, { fontFamily: ui.bodyBold }]}>{title ?? t("laneHowToTitle")}</Text>
        <Text style={[styles.headline, { fontFamily: ui.bodyBold }]}>{t("laneHowToHeadline")}</Text>
        <Text style={[styles.body, { fontFamily: ui.body }]}>{t("laneHowToBody")}</Text>

        <View style={styles.lanes}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.lane}>
              {i === 1 ? <View style={styles.player} /> : <View style={styles.bar} />}
            </View>
          ))}
        </View>
        <Text style={[styles.demoLabel, { color: LIME, fontFamily: ui.bodyMedium }]}>{t("laneHowToMove")}</Text>

        <View style={styles.bullets}>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("laneHowToTip1")}</Text>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("laneHowToTip2")}</Text>
          <Text style={[styles.bullet, { fontFamily: ui.body }]}>{t("laneHowToTip3")}</Text>
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
  },
  lanes: {
    flexDirection: "row",
    height: 88,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1C1430",
    marginTop: 4,
  },
  lane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(245,240,255,0.15)",
  },
  player: {
    width: 28,
    height: 40,
    borderRadius: 14,
    backgroundColor: LIME,
  },
  bar: {
    width: 36,
    height: 14,
    borderRadius: 8,
    backgroundColor: PINK,
    marginBottom: 28,
  },
  demoLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  bullets: { gap: 6, marginTop: 8, marginBottom: 4 },
  bullet: { color: INK, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
