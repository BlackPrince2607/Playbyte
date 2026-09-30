import { useState } from "react";
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ResultBar } from "../../components/StitchPrimitives";
import { scoreRows, statRows } from "../../game/ui/resultSummary";
import type { SaveState } from "../../game/session/submitQueue";
import type { RoundRecord } from "../../game/session/types";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  score: number;
  /** Null when the play has not reached the server yet. */
  percentile: number | null;
  gameTitle: string;
  onBackToFeed: () => void;
  onPlayAgain?: () => void;
  /** Absent when the feed has no other game. */
  onNextGame?: () => void;
  saveState?: SaveState;
  saveMessage?: string;
  onRetrySave?: () => void;
  retryingSave?: boolean;
  /** When true, shows Share CTA that uses native share of score text (no share-card API for games). */
  enableShare?: boolean;
  optionBreakdown?: { label: string; percent: number; highlight?: boolean }[];
  correct?: number;
  attempts?: number;
  rounds?: RoundRecord[];
  scoreBreakdown?: Record<string, number>;
};

const BAR_MAX_HEIGHT = 72;

function RoundBars({ rounds }: { rounds: RoundRecord[] }) {
  const top = Math.max(1, ...rounds.map((r) => r.points));
  const dense = rounds.length > 12;
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>ROUND BY ROUND</Text>
      <View style={styles.barsRow}>
        {rounds.map((r) => {
          const perfect = r.attempts > 0 && r.correct === r.attempts;
          const missed = r.attempts > 0 && r.correct === 0;
          const color = perfect ? colors.lime : missed ? colors.pink : colors.lilac;
          return (
            <View
              key={r.round}
              style={styles.barCol}
              accessible
              accessibilityLabel={`Round ${r.round}: ${r.points} points${r.attempts ? `, ${r.correct} of ${r.attempts} correct` : ""}`}
            >
              {dense ? null : <Text style={[type.micro, { color: colors.paper }]}>{r.points}</Text>}
              <View style={[styles.bar, { height: Math.max(4, (Math.max(0, r.points) / top) * BAR_MAX_HEIGHT), backgroundColor: color }]} />
              <Text style={[type.micro, { color: colors.lilac }]}>{!dense || r.round % 5 === 0 ? r.round : " "}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ScoreComposition({ breakdown }: { breakdown?: Record<string, number> }) {
  const points = scoreRows(breakdown);
  const stats = statRows(breakdown);
  if (!points.length && !stats.length) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>HOW YOU SCORED</Text>
      {points.map((row) => (
        <View key={row.label} style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value} points`}>
          <Text style={[type.bodySm, { color: colors.lilac }]}>{row.label}</Text>
          <Text style={[type.bodySm, { color: row.value < 0 ? colors.pinkSoft : colors.paper, fontFamily: fonts.bodyBold }]}>
            {row.value > 0 ? `+${row.value}` : `−${Math.abs(row.value)}`}
          </Text>
        </View>
      ))}
      {stats.length ? (
        <View style={[styles.statWrap, points.length ? { marginTop: spacing.sm } : null]}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
              <Text style={[type.bodySm, { color: colors.paper, fontFamily: fonts.bodyBold }]}>{s.value}</Text>
              <Text style={[type.micro, { color: colors.lilac }]}>{s.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function PostGameResultScreen({
  score,
  percentile,
  gameTitle,
  onBackToFeed,
  onPlayAgain,
  onNextGame,
  saveState = "saved",
  saveMessage,
  onRetrySave,
  retryingSave = false,
  enableShare = true,
  optionBreakdown,
  correct,
  attempts,
  rounds,
  scoreBreakdown,
}: Props) {
  const betterThan = percentile === null ? null : Math.max(0, Math.min(100, Math.round(percentile)));
  const headline = betterThan === null ? "Run complete." : betterThan >= 50 ? "Strong run." : "Nice try.";
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const showAccuracy = attempts !== undefined && attempts > 0 && correct !== undefined;

  async function shareScore() {
    setSharing(true);
    setShareError("");
    try {
      const result = await Share.share({
        message:
          betterThan === null
            ? `I scored ${score} on ${gameTitle} on PLAY.`
            : `I scored ${score} on ${gameTitle} — better than ${betterThan}% of players today on PLAY.`,
      });
      if (result.action === Share.dismissedAction) {
        /* user cancelled — not an error */
      }
    } catch {
      setShareError("Could not open share sheet. Try again.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.ink }} contentContainerStyle={styles.wrap}>
      <Text style={[type.hero, { color: colors.paper, textAlign: "center" }]}>
        {headline}
      </Text>
      <Text style={[type.metadata, styles.eyebrow]}>{gameTitle.toUpperCase()} · RESULT</Text>

      <View style={styles.scoreWrap}>
        <Text style={[type.largeScore, { color: colors.lime }]}>{score}</Text>
      </View>
      {betterThan !== null ? (
        <Text style={[type.bodyLg, { color: colors.lilac }]}>Better than {betterThan}% of players today</Text>
      ) : null}

      {saveState !== "saved" ? (
        <View
          style={[styles.saveBanner, saveState === "rejected" && { borderColor: colors.pinkSoft }]}
          accessibilityRole="alert"
        >
          <Text style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>
            {saveMessage ??
              (saveState === "queued"
                ? "Couldn't reach the server. Your score is saved on this phone and will sync automatically."
                : "This score couldn't be recorded.")}
          </Text>
          {saveState === "queued" && onRetrySave ? (
            <PrimaryButton
              label={retryingSave ? "Saving…" : "Try saving now"}
              variant="secondary"
              disabled={retryingSave}
              onPress={onRetrySave}
              icon="cloud-upload-outline"
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={[type.statsSm, { color: colors.paper }]}>{score}</Text>
          <Text style={[type.micro, { color: colors.lilac }]}>YOUR SCORE</Text>
        </View>
        {betterThan !== null ? (
          <View style={styles.tile}>
            <Text style={[type.statsSm, { color: colors.limeLive }]}>{betterThan}%</Text>
            <Text style={[type.micro, { color: colors.lilac, textAlign: "center" }]}>BETTER THAN{"\n"}PLAYERS</Text>
          </View>
        ) : null}
        {showAccuracy ? (
          <View style={styles.tile} accessible accessibilityLabel={`${correct} of ${attempts} correct`}>
            <Text style={[type.statsSm, { color: colors.paper }]}>
              {correct}/{attempts}
            </Text>
            <Text style={[type.micro, { color: colors.lilac }]}>CORRECT</Text>
          </View>
        ) : null}
      </View>

      {rounds && rounds.length > 1 ? <RoundBars rounds={rounds} /> : null}
      <ScoreComposition breakdown={scoreBreakdown} />

      {optionBreakdown && optionBreakdown.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>HOW THE CROWD VOTED</Text>
          {optionBreakdown.map((o) => (
            <ResultBar key={o.label} label={o.label} percent={o.percent} highlight={o.highlight} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {onPlayAgain ? <PrimaryButton label="Play again" onPress={onPlayAgain} icon="refresh" /> : null}
        {onNextGame ? (
          <PrimaryButton
            label="Next game"
            variant={onPlayAgain ? "secondary" : "primary"}
            onPress={onNextGame}
            trailingIcon="arrow-forward"
          />
        ) : null}
        <View style={styles.actionRow}>
          {enableShare ? (
            <PrimaryButton
              label={sharing ? "Opening…" : shareError ? "Retry share" : "Share"}
              variant="secondary"
              disabled={sharing}
              onPress={() => void shareScore()}
              icon="share-outline"
              style={styles.actionRowItem}
            />
          ) : null}
          <PrimaryButton label="Feed" variant="secondary" onPress={onBackToFeed} icon="home-outline" style={styles.actionRowItem} />
        </View>
        {sharing ? <ActivityIndicator color={colors.lime} style={{ marginTop: 4 }} /> : null}
        {shareError ? (
          <Text style={[type.metadata, { color: colors.pinkSoft, textAlign: "center" }]}>{shareError}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.margin,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.lilac,
    letterSpacing: 2,
    marginTop: spacing.xs,
    fontFamily: fonts.bodyBold,
  },
  scoreWrap: { position: "relative", marginVertical: spacing.md },
  tiles: { flexDirection: "row", gap: spacing.sm, width: "100%", marginTop: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  panel: {
    width: "100%",
    marginTop: spacing.md,
    backgroundColor: "rgba(33,21,64,0.6)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  panelTitle: {
    ...type.metadata,
    color: colors.lilac,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  barsRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 4 },
  barCol: { flex: 1, alignItems: "center", gap: 4, maxWidth: 40 },
  bar: { width: "70%", borderRadius: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  statWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: {
    flexGrow: 1,
    minWidth: 80,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
  },
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.xl },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionRowItem: { flex: 1, paddingHorizontal: spacing.sm },
  saveBanner: {
    width: "100%",
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardAlt,
  },
});
