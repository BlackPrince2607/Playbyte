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
const CORAL = "#FF4D6D";
const OK = "#2F9E6B";

function MiniCell({ glyph, tone }: { glyph?: string; tone?: "ok" | "bad" | "empty" }) {
  const bg = tone === "ok" ? OK : tone === "bad" ? CORAL : glyph ? PURPLE : EMPTY;
  return (
    <View style={[styles.cell, { backgroundColor: bg }]}>
      {glyph ? <Text style={styles.glyph}>{glyph}</Text> : null}
    </View>
  );
}

function DemoRow({
  label,
  cells,
  ok,
}: {
  label: string;
  cells: { glyph?: string; tone?: "ok" | "bad" | "empty" }[];
  ok: boolean;
}) {
  return (
    <View style={styles.demoBlock}>
      <View style={styles.demoRow}>
        {cells.map((c, i) => (
          <MiniCell key={i} glyph={c.glyph} tone={c.tone} />
        ))}
      </View>
      <Text style={[styles.demoLabel, { color: ok ? OK : CORAL }]}>{label}</Text>
    </View>
  );
}

export function ArrowHowTo({ onDone, title }: { onDone: () => void; title?: string }) {
  const { t } = useLanguage();
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={styles.kicker}>{title ?? t("arrowHowToTitle")}</Text>
        <Text style={styles.headline}>{t("arrowHowToHeadline")}</Text>
        <Text style={styles.body}>{t("arrowHowToBody")}</Text>

        <DemoRow
          ok={false}
          label={t("arrowHowToBlocked")}
          cells={[{ glyph: "→", tone: "bad" }, {}, { glyph: "→" }, {}, {}]}
        />
        <DemoRow
          ok
          label={t("arrowHowToClear")}
          cells={[{ glyph: "→", tone: "ok" }, {}, {}, {}, {}]}
        />

        <View style={styles.bullets}>
          <Text style={styles.bullet}>{t("arrowHowToTip1")}</Text>
          <Text style={styles.bullet}>{t("arrowHowToTip2")}</Text>
          <Text style={styles.bullet}>{t("arrowHowToTip3")}</Text>
        </View>

        <PrimaryButton label={t("arrowHowToPlay")} onPress={onDone} variant="success" style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
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
  demoBlock: { gap: 6, marginTop: 4 },
  demoRow: { flexDirection: "row", gap: 6 },
  cell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { color: "#FFFFFF", fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 22 },
  demoLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  bullets: { gap: 6, marginTop: 8, marginBottom: 4 },
  bullet: { color: INK, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
