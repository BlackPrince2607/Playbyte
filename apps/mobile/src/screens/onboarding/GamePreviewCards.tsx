import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurMask, Canvas, Circle, Group, Path, RoundedRect } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts } from "../../theme/typography";
import { PulseDot } from "./ui";

export const PREVIEW_XP = [150, 180, 120, 200];

function Tag({ label, bordered }: { label: string; bordered?: boolean }) {
  return (
    <View style={[styles.tag, bordered && { borderWidth: 1, borderColor: "rgba(189,245,50,0.2)" }]}>
      <PulseDot size={6} color={surface.lime} />
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

function Timer({ label, pill }: { label: string; pill?: boolean }) {
  return (
    <View style={[styles.timer, pill && styles.timerPill]}>
      <Ionicons name="timer-outline" size={13} color={surface.lime} />
      <Text style={styles.mono}>{label}</Text>
    </View>
  );
}

function HeaderIcons({ heart = true }: { heart?: boolean }) {
  return (
    <>
      <Ionicons name="volume-high" size={16} color={colors.pinkSoft} />
      {heart ? <Ionicons name="heart-outline" size={16} color={surface.onSurfaceVariant} /> : null}
    </>
  );
}

function Question({ children, size = 30 }: { children: string; size?: number }) {
  return <Text style={[styles.question, { fontSize: size, lineHeight: size * 1.12 }]}>{children}</Text>;
}

const QUIZ_ANSWERS = ["Toy Story", "Finding Nemo", "Up", "Inside Out"];

export function QuizPreview() {
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Tag label="MOVIES" />
        <View style={styles.icons}>
          <HeaderIcons />
        </View>
      </View>
      <Question>Guess the movie?</Question>
      <LinearGradient colors={["#1c2b4a", "#123c48", colors.cardAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.still}>
        <Text style={styles.stillEmoji}>🤠 🚀</Text>
        <View style={[styles.timerFloat]}>
          <Timer label="08s" />
        </View>
      </LinearGradient>
      <View style={{ gap: spacing.sm, paddingTop: 4 }}>
        {QUIZ_ANSWERS.map((a, i) => {
          const right = i === 0;
          return (
            <View key={a} style={[styles.answer, right && styles.answerRight]}>
              <View style={styles.answerLeft}>
                <View style={[styles.letter, right && { backgroundColor: "rgba(21,14,43,0.2)" }]}>
                  <Text style={[styles.letterText, right && { color: surface.onLimeDeep, fontFamily: fonts.bodyBold }]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text style={[styles.answerText, right && { color: surface.onLimeDeep, fontFamily: fonts.bodyBold }]}>{a}</Text>
              </View>
              {right ? (
                <View style={styles.tick}>
                  <Ionicons name="checkmark" size={13} color={surface.lime} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Lime trail through the neon maze, in a 100×75 board space. */
const TRAIL = "M9 12 L9 35 L26 35 L26 53 L43 53 L43 38 L60 38 L60 17 L79 17 L79 39";
const WALLS =
  "M4 4 H96 V71 H4 Z M17 4 V26 M17 44 H34 M34 26 V44 M4 62 H34 M51 26 H70 M51 44 V71 M70 26 V60 H87 M87 8 V26 M60 62 H78";

function MazeBoard() {
  const [w, setW] = useState(0);
  const s = w / 100;
  return (
    <View style={styles.mazeBoard} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ scale: s }]}>
            <Path path={WALLS} color="rgba(143,127,192,0.45)" style="stroke" strokeWidth={1.2} strokeCap="round" />
            <Path path={TRAIL} color={surface.lime} style="stroke" strokeWidth={3.2} strokeJoin="round" strokeCap="round">
              <BlurMask blur={3} style="solid" />
            </Path>
            <Path path="M79 39 V60 H88" color="rgba(255,177,196,0.7)" style="stroke" strokeWidth={1} strokeCap="round" />
            {[
              [43, 53],
              [60, 38],
              [79, 17],
            ].map(([x, y]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} color={surface.lime} />
            ))}
            <Circle cx={79} cy={39} r={3} color={surface.lime} />
            <Circle cx={79} cy={39} r={1.4} color="#0d0722" />
            <RoundedRect x={86} y={55} width={9} height={9} r={2} color="rgba(42,27,78,0.9)" />
            <RoundedRect x={86} y={55} width={9} height={9} r={2} color="rgba(245,240,255,0.5)" style="stroke" strokeWidth={0.8} />
          </Group>
        </Canvas>
      ) : null}
      <View style={styles.mazeStat}>
        <View style={styles.limeDot} />
        <Text style={styles.mono}>Moves: 12 • 94% Solved</Text>
      </View>
    </View>
  );
}

function PadKey({ icon, kind = "idle" }: { icon: keyof typeof Ionicons.glyphMap; kind?: "idle" | "touch" | "go" }) {
  const bg = kind === "go" ? surface.lime : kind === "touch" ? surface.limeDeep : colors.cardAlt;
  const fg = kind === "go" ? colors.ink : kind === "touch" ? surface.onLimeDeep : colors.lilac;
  return (
    <View style={[styles.padKey, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={kind === "touch" ? 14 : 16} color={fg} />
    </View>
  );
}

export function MazePreview() {
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Tag label="⚡ NEON MAZE" />
        <View style={styles.icons}>
          <Timer label="09s" pill />
          <HeaderIcons />
        </View>
      </View>
      <Question>Guide to the trophy!</Question>
      <MazeBoard />
      <View style={styles.control}>
        <View style={{ flex: 1 }}>
          <Text style={styles.controlEyebrow}>ONE-SWIPE CONTROL</Text>
          <Text style={styles.controlTitle}>Swipe to dash</Text>
        </View>
        <View style={styles.pad}>
          <View style={styles.padRow}>
            <PadKey icon="arrow-up" />
          </View>
          <View style={styles.padRow}>
            <PadKey icon="arrow-back" />
            <PadKey icon="hand-left" kind="touch" />
            <PadKey icon="arrow-forward" kind="go" />
          </View>
          <View style={styles.padRow}>
            <PadKey icon="arrow-down" />
          </View>
        </View>
      </View>
    </View>
  );
}

const POLL = [
  { label: "🍜 Maggi / Noodles", pct: 68 },
  { label: "🍕 Leftover Pizza", pct: 22 },
  { label: "🍦 Ice Cream", pct: 10 },
];

export function PollPreview() {
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Tag label="🔥 HOT TAKE" />
        <View style={styles.icons}>
          <HeaderIcons />
        </View>
      </View>
      <Question>Best late-night food?</Question>
      <View style={styles.pollMeta}>
        <Ionicons name="checkbox-outline" size={14} color={surface.lime} />
        <Text style={[styles.metaText, { color: surface.lime, fontFamily: fonts.bodyBold }]}>14.2k votes</Text>
        <Text style={styles.metaText}>•</Text>
        <Ionicons name="time-outline" size={13} color="rgba(143,127,192,0.8)" />
        <Text style={styles.metaText}>Ends in 2h</Text>
      </View>
      <View style={{ gap: 10, paddingTop: 4 }}>
        {POLL.map((o, i) => {
          const mine = i === 0;
          return (
            <View key={o.label} style={[styles.pollRow, mine && styles.pollRowMine]}>
              <View
                style={[
                  styles.pollFill,
                  { width: `${o.pct}%`, backgroundColor: mine ? "rgba(162,216,1,0.9)" : colors.cardAlt },
                ]}
              />
              <View style={styles.answerLeft}>
                {mine ? (
                  <View style={[styles.tick, { width: 24, height: 24, borderRadius: 12 }]}>
                    <Ionicons name="checkmark" size={14} color={surface.lime} />
                  </View>
                ) : (
                  <View style={[styles.letter, { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(21,14,43,0.5)" }]}>
                    <Text style={[styles.letterText, { fontFamily: fonts.bodyBold }]}>{String.fromCharCode(65 + i)}</Text>
                  </View>
                )}
                <Text style={[styles.answerText, mine && { color: surface.onLimeDeep, fontFamily: fonts.bodyBold }]}>{o.label}</Text>
              </View>
              <Text style={[styles.pct, { color: mine ? surface.onLimeDeep : colors.lilac }]}>{o.pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const GRID = ["PLAYO", "MAJAT", "GAMER", "KWINS", "ZQUIZ"];

function cellStyle(row: number, col: number): { box: ViewStyle; color: string } {
  if (row === 0 && col < 4) return { box: { backgroundColor: surface.lime }, color: colors.ink };
  if (row === 1 && col < 4) return { box: { backgroundColor: colors.pink }, color: colors.paper };
  if (row === 2 && col === 0) {
    return {
      box: { backgroundColor: "rgba(189,245,50,0.2)", borderWidth: 1, borderColor: "rgba(189,245,50,0.4)" },
      color: surface.lime,
    };
  }
  return {
    box: { backgroundColor: "rgba(21,14,43,0.6)", borderWidth: 1, borderColor: "rgba(245,240,255,0.04)" },
    color: "rgba(245,240,255,0.6)",
  };
}

function WordChip({ word, found }: { word: string; found: boolean }) {
  return (
    <View style={[styles.wordChip, found ? styles.wordChipFound : styles.wordChipOpen]}>
      <Text style={[styles.wordChipText, { color: found ? surface.lime : "rgba(245,240,255,0.7)" }]}>{word}</Text>
      {found ? (
        <Ionicons name="checkmark-circle" size={12} color={surface.lime} />
      ) : (
        <Text style={[styles.mono, { color: colors.lilac, fontSize: 10 }]}>[1 left]</Text>
      )}
    </View>
  );
}

export function WordSearchPreview() {
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Tag label="🔤 WORD SEARCH" bordered />
        <View style={styles.icons}>
          <Timer label="15s" pill />
          <HeaderIcons heart={false} />
        </View>
      </View>
      <Question size={22}>Find 3 hidden words:</Question>
      <View style={styles.wordChips}>
        <WordChip word="PLAY" found />
        <WordChip word="MAJA" found />
        <WordChip word="GAME" found={false} />
      </View>
      <View style={styles.gridWrap}>
        {GRID.map((row, r) => (
          <View key={row} style={styles.gridRow}>
            {r < 2 ? (
              <View
                style={[
                  styles.capsule,
                  r === 0
                    ? { borderColor: surface.lime, backgroundColor: "rgba(189,245,50,0.25)", boxShadow: "0 0 12px rgba(189,245,50,0.5)" }
                    : { borderColor: colors.pink, backgroundColor: "rgba(255,77,141,0.2)", boxShadow: "0 0 12px rgba(255,77,141,0.4)" },
                ]}
              />
            ) : null}
            {row.split("").map((ch, c) => {
              const { box, color } = cellStyle(r, c);
              return (
                <View key={c} style={[styles.cell, box]}>
                  <Text style={[styles.cellText, { color }]}>{ch}</Text>
                  {r === 2 && c === 0 ? <PulseDot size={10} color={surface.lime} style={styles.cellPing} /> : null}
                </View>
              );
            })}
          </View>
        ))}
        <View style={styles.swipeHint}>
          <Ionicons name="hand-left" size={18} color={surface.lime} style={{ transform: [{ rotate: "-30deg" }] }} />
          <View style={styles.swipeHintPill}>
            <Text style={styles.swipeHintText}>Swipe to connect</Text>
          </View>
        </View>
      </View>
      <View style={styles.found}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="checkmark-done-circle" size={16} color={surface.lime} />
          <Text style={[styles.controlTitle, { fontSize: 14 }]}>Words Found:</Text>
          <Text style={[styles.mono, { fontSize: 14 }]}>2/3</Text>
        </View>
        <View style={styles.bar}>
          <View style={styles.barFill} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.ink, borderRadius: 24, padding: 10, gap: 8, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 4 },
  icons: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.cardAlt,
  },
  tagText: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 13, letterSpacing: 1, color: surface.lime },
  mono: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 13, color: surface.lime },
  timer: { flexDirection: "row", alignItems: "center", gap: 4 },
  timerPill: { backgroundColor: "rgba(42,27,78,0.9)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  question: { fontFamily: fonts.display, color: colors.paper },
  still: { height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  stillEmoji: { fontSize: 44, opacity: 0.85 },
  timerFloat: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(21,14,43,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  answer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
  },
  answerRight: { backgroundColor: surface.limeDeep, boxShadow: "0 4px 10px rgba(0,0,0,0.3)" },
  answerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  letter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(21,14,43,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { fontFamily: fonts.mono, fontSize: 10, color: colors.lilac },
  answerText: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: "rgba(245,240,255,0.85)" },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  mazeBoard: {
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: "#0d0722",
    borderWidth: 1,
    borderColor: "rgba(143,127,192,0.2)",
    overflow: "hidden",
  },
  mazeStat: {
    position: "absolute",
    left: 10,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(21,14,43,0.8)",
    borderWidth: 1,
    borderColor: "rgba(143,127,192,0.2)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  limeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: surface.lime },
  control: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(42,27,78,0.6)",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  controlEyebrow: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.lilac },
  controlTitle: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: colors.paper },
  pad: { width: 84, gap: 4, alignItems: "center" },
  padRow: { flexDirection: "row", gap: 4 },
  padKey: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pollMeta: { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 4 },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: "rgba(143,127,192,0.8)" },
  pollRow: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(42,27,78,0.7)",
    borderWidth: 1,
    borderColor: "rgba(245,240,255,0.04)",
    overflow: "hidden",
  },
  pollRowMine: { backgroundColor: colors.cardAlt, borderColor: "rgba(189,245,50,0.5)" },
  pollFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  pct: { fontFamily: fonts.mono, fontSize: 14 },
  wordChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  wordChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  wordChipFound: { backgroundColor: "rgba(162,216,1,0.25)", borderColor: "rgba(162,216,1,0.6)" },
  wordChipOpen: { backgroundColor: colors.cardAlt, borderColor: colors.line },
  wordChipText: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 15 },
  gridWrap: {
    borderRadius: 16,
    padding: 10,
    gap: 6,
    backgroundColor: "rgba(42,27,78,0.8)",
    borderWidth: 1,
    borderColor: "rgba(245,240,255,0.06)",
  },
  gridRow: { flexDirection: "row", gap: 6 },
  capsule: { position: "absolute", left: -3, top: -3, bottom: -3, right: "19%", borderRadius: 999, borderWidth: 2 },
  cell: { flex: 1, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cellText: { fontFamily: fonts.mono, fontSize: 15 },
  cellPing: { position: "absolute", top: -4, right: -4 },
  swipeHint: { position: "absolute", right: 20, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  swipeHintPill: {
    backgroundColor: "rgba(21,14,43,0.9)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  swipeHintText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.paper },
  found: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(42,27,78,0.9)",
    borderWidth: 1,
    borderColor: colors.line,
  },
  bar: { width: 80, height: 8, borderRadius: 4, backgroundColor: colors.ink, overflow: "hidden" },
  barFill: { width: "66%", height: "100%", borderRadius: 4, backgroundColor: surface.lime },
});
