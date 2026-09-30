import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import type { SessionSnapshot } from "../session/runner";
import { StreakBadge, TimerBar, usePop } from "./motion";

type Props = {
  title: string;
  subtitle?: string;
  snapshot: SessionSnapshot<unknown>;
  now: () => number;
  onPause: () => void;
  children: React.ReactNode;
};

/** Shared HUD: identity, progress, score, streak, lives and timer around any engine's playfield. */
export function GameFrame({ title, subtitle, snapshot, now, onPause, children }: Props) {
  const insets = useSafeAreaInsets();
  const scorePop = usePop(snapshot.score);
  const { round, totalRounds, lives } = snapshot;
  const pct = totalRounds ? Math.min(1, Math.max(0, (round - (snapshot.status === "playing" ? 1 : 0)) / totalRounds)) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onPause}
          accessibilityRole="button"
          accessibilityLabel="Pause game"
          hitSlop={12}
          style={styles.pauseBtn}
        >
          <Text style={[type.button, { color: colors.paper, lineHeight: 20 }]}>II</Text>
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={[type.micro, styles.eyebrow]} numberOfLines={1}>
            {subtitle ?? "PLAY"}
          </Text>
          <Text style={[type.button, { color: colors.paper }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Animated.View style={scorePop} accessibilityLabel={`Score ${snapshot.score}`}>
          <Text style={[type.stats, { color: colors.lime }]}>{snapshot.score}</Text>
        </Animated.View>
      </View>

      <View style={styles.meta}>
        {totalRounds ? (
          <View style={styles.progressTrack} accessibilityLabel={`Round ${round} of ${totalRounds}`}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
          </View>
        ) : (
          <Text style={[type.micro, { color: colors.lilac, flex: 1 }]}>ROUND {round}</Text>
        )}
        {totalRounds ? (
          <Text style={[type.micro, { color: colors.lilac, marginLeft: spacing.sm }]}>
            {Math.min(round, totalRounds)}/{totalRounds}
          </Text>
        ) : null}
        {lives !== undefined ? (
          <Text style={[type.micro, { color: colors.pink, marginLeft: spacing.sm }]} accessibilityLabel={`${lives} lives`}>
            {"♥".repeat(Math.max(0, lives))}
          </Text>
        ) : null}
        <View style={{ marginLeft: spacing.sm }}>
          <StreakBadge streak={snapshot.streak} />
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.margin, marginTop: spacing.xs }}>
        <TimerBar deadline={snapshot.deadline} now={now} paused={snapshot.status !== "playing"} />
      </View>

      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.margin },
  pauseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  eyebrow: { color: colors.lime, letterSpacing: 2, fontFamily: fonts.bodyBold },
  meta: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.margin, marginTop: spacing.sm, minHeight: 24 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.lilac },
  body: { flex: 1, marginTop: spacing.md },
});
