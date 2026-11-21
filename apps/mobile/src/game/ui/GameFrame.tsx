import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "../../components/AvatarImage";
import { useLanguage } from "../../context/LanguageContext";
import { fill } from "../../i18n/strings";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import type { SessionSnapshot } from "../session/runner";
import { StreakBadge, TimerCountdown, usePop } from "./motion";

export type DuelHud = {
  you: { displayName: string; avatarKey?: string | null };
  opponent: { displayName: string; avatarKey?: string | null };
};

type Props = {
  title: string;
  subtitle?: string;
  snapshot: SessionSnapshot<unknown>;
  now: () => number;
  onPause: () => void;
  children: React.ReactNode;
  /** When set, HUD shows both PFPs and a race-style dual progress bar. */
  duel?: DuelHud | null;
};

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Rival bar tracks the player with a slight pace offset so the match feels live. */
function rivalProgress(playerPct: number, elapsedMs: number, name: string, playing: boolean) {
  if (!playing && playerPct >= 1) return Math.min(0.96, Math.max(playerPct * 0.9, 0.55));
  const h = hashName(name || "rival");
  const pace = 0.78 + (h % 45) / 100;
  const wobble = Math.sin(elapsedMs / 850 + (h % 9)) * 0.05;
  const timePct = Math.min(0.94, (elapsedMs / 42000) * pace);
  const blend = timePct * 0.5 + playerPct * 0.5 + wobble;
  return Math.max(0, Math.min(0.97, blend));
}

function RaceBar({
  pct,
  color,
  label,
}: {
  pct: number;
  color: string;
  label: string;
}) {
  return (
    <View style={styles.raceTrack} accessibilityLabel={`${label} ${Math.round(pct * 100)} percent`}>
      <View style={[styles.raceFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Shared HUD: identity, progress, score, streak, lives and timer around any engine's playfield. */
export function GameFrame({ title, subtitle, snapshot, now, onPause, children, duel }: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();
  const scorePop = usePop(snapshot.score);
  const { round, totalRounds, lives } = snapshot;
  const playerPct = totalRounds
    ? Math.min(1, Math.max(0, (round - (snapshot.status === "playing" ? 1 : 0)) / totalRounds))
    : snapshot.status === "completed"
      ? 1
      : Math.min(0.95, Math.max(0, now() / 45000));

  const [rivalPct, setRivalPct] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!duel || snapshot.status !== "playing") return;
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [duel, snapshot.status]);

  useEffect(() => {
    if (!duel) return;
    const elapsed = Math.max(0, now());
    setRivalPct(
      rivalProgress(playerPct, elapsed, duel.opponent.displayName, snapshot.status === "playing"),
    );
  }, [duel, playerPct, snapshot.status, tick, now]);

  if (duel) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onPause}
            accessibilityRole="button"
            accessibilityLabel={t("pauseGame")}
            hitSlop={12}
            style={styles.pauseBtn}
          >
            <Text style={[type.button, { color: colors.paper, lineHeight: 20 }]}>II</Text>
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
            <Text style={[type.micro, styles.eyebrow]} numberOfLines={1}>
              VS {duel.opponent.displayName.toUpperCase()}
            </Text>
            <Text style={[type.button, { color: colors.paper, fontFamily: ui.bodyBold }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={{ marginRight: spacing.sm }}>
            <TimerCountdown deadline={snapshot.deadline} now={now} paused={snapshot.status !== "playing"} />
          </View>
          <Animated.View style={scorePop} accessibilityLabel={`Score ${snapshot.score}`}>
            <Text style={[type.stats, { color: colors.lime }]}>{snapshot.score}</Text>
          </Animated.View>
        </View>

        <View style={styles.duelRow}>
          <View style={styles.duelSide}>
            <View style={[styles.pfpRing, { borderColor: surface.lime }]}>
              <AvatarImage displayName={duel.you.displayName} avatarKey={duel.you.avatarKey} size={36} />
            </View>
            <View style={styles.duelBars}>
              <Text style={[styles.duelName, { color: surface.lime }]} numberOfLines={1}>
                {duel.you.displayName}
              </Text>
              <RaceBar pct={playerPct} color={surface.lime} label={duel.you.displayName} />
            </View>
          </View>

          <Text style={styles.vsChip}>VS</Text>

          <View style={[styles.duelSide, styles.duelSideOpp]}>
            <View style={[styles.duelBars, { alignItems: "flex-end" }]}>
              <Text style={[styles.duelName, { color: colors.pink, textAlign: "right" }]} numberOfLines={1}>
                {duel.opponent.displayName}
              </Text>
              <RaceBar pct={rivalPct} color={colors.pink} label={duel.opponent.displayName} />
            </View>
            <View style={[styles.pfpRing, { borderColor: colors.pink }]}>
              <AvatarImage
                displayName={duel.opponent.displayName}
                avatarKey={duel.opponent.avatarKey}
                size={36}
              />
            </View>
          </View>
        </View>

        <View style={styles.meta}>
          {totalRounds ? (
            <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>
              {Math.min(round, totalRounds)}/{totalRounds}
            </Text>
          ) : (
            <Text style={[type.micro, { color: colors.lilac, flex: 1, fontFamily: ui.bodyMedium }]}>
              {fill(t("roundOnly"), { round })}
            </Text>
          )}
          {lives !== undefined ? (
            <Text style={[type.micro, { color: colors.pink, marginLeft: spacing.sm }]} accessibilityLabel={`${lives} lives`}>
              {"♥".repeat(Math.max(0, lives))}
            </Text>
          ) : null}
          <View style={{ marginLeft: "auto" }}>
            <StreakBadge streak={snapshot.streak} />
          </View>
        </View>

        <View style={styles.body}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onPause}
          accessibilityRole="button"
          accessibilityLabel={t("pauseGame")}
          hitSlop={12}
          style={styles.pauseBtn}
        >
          <Text style={[type.button, { color: colors.paper, lineHeight: 20 }]}>II</Text>
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={[type.micro, styles.eyebrow]} numberOfLines={1}>
            {subtitle ?? "MAJA"}
          </Text>
          <Text style={[type.button, { color: colors.paper, fontFamily: ui.bodyBold }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={{ marginRight: spacing.sm }}>
          <TimerCountdown deadline={snapshot.deadline} now={now} paused={snapshot.status !== "playing"} />
        </View>
        <Animated.View style={scorePop} accessibilityLabel={`Score ${snapshot.score}`}>
          <Text style={[type.stats, { color: colors.lime }]}>{snapshot.score}</Text>
        </Animated.View>
      </View>

      <View style={styles.meta}>
        {totalRounds ? (
          <View style={styles.progressTrack} accessibilityLabel={`Round ${round} of ${totalRounds}`}>
            <View style={[styles.progressFill, { width: `${playerPct * 100}%` }]} />
          </View>
        ) : (
          <Text style={[type.micro, { color: colors.lilac, flex: 1, fontFamily: ui.bodyMedium }]}>
            {fill(t("roundOnly"), { round })}
          </Text>
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
  meta: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.margin,
    marginTop: spacing.sm,
    minHeight: 24,
  },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.lilac },
  body: { flex: 1, marginTop: spacing.md },
  duelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.margin,
    marginTop: spacing.sm,
    gap: 8,
  },
  duelSide: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  duelSideOpp: { justifyContent: "flex-end" },
  duelBars: { flex: 1, gap: 4, minWidth: 0 },
  duelName: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  pfpRing: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 1,
  },
  raceTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardAlt,
    overflow: "hidden",
    width: "100%",
  },
  raceFill: { height: 8, borderRadius: 4 },
  vsChip: {
    fontFamily: fonts.display,
    fontSize: 11,
    color: colors.paper,
    letterSpacing: 1,
  },
});
