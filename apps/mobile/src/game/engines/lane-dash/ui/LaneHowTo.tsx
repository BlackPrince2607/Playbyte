import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../../../components/PrimaryButton";
import { fonts } from "../../../../theme/typography";

const LAVENDER = "#F3F0FA";
const PURPLE = "#635BFF";
const INK = "#1C1430";
const MUTED = "#8B849C";
const LIME = "#C6FF3D";
const PINK = "#FF4D8D";

export function LaneHowTo({ onDone, title }: { onDone: () => void; title?: string }) {
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={styles.kicker}>{title ?? "LANE DASH"}</Text>
        <Text style={styles.headline}>Stay in a clear lane.</Text>
        <Text style={styles.body}>Swipe or tap left, center, or right. Dodge the bars — three hits and you&apos;re out.</Text>

        <View style={styles.lanes}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.lane}>
              {i === 1 ? <View style={styles.player} /> : <View style={styles.bar} />}
            </View>
          ))}
        </View>
        <Text style={[styles.demoLabel, { color: LIME }]}>Move to the open lane</Text>

        <View style={styles.bullets}>
          <Text style={styles.bullet}>• Tap a third of the screen or swipe sideways</Text>
          <Text style={styles.bullet}>• Near-misses earn bonus points</Text>
          <Text style={styles.bullet}>• Survive the timer for a finish bonus</Text>
        </View>

        <PrimaryButton label="Play" onPress={onDone} variant="success" style={{ marginTop: 8 }} />
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
