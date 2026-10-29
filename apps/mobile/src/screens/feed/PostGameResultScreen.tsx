import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CoinIcon } from "../../components/CoinIcon";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ResultBar } from "../../components/StitchPrimitives";
import { prefersReducedMotion } from "../../game/ui/feedback";
import { Confetti } from "../../game/ui/motion";
import { fakeBeatenCount, resultHeadline, scoreRows, statRows } from "../../game/ui/resultSummary";
import type { SaveState } from "../../game/session/submitQueue";
import type { RoundRecord } from "../../game/session/types";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { localizeChrome } from "../../i18n/chrome";
import { fill } from "../../i18n/strings";
import { capture } from "../../lib/analytics";
import { APP_SHARE_URL } from "../../lib/links";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  score: number;
  /** Null when the play has not reached the server yet. */
  percentile: number | null;
  gameKey?: string;
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
  coinsEarned?: number;
};

const BAR_MAX_HEIGHT = 72;
const COUNT_UP_MS = 900;

function useCountUp(target: number) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_UP_MS);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

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
  const { language, fonts: ui } = useLanguage();
  const points = scoreRows(breakdown);
  const stats = statRows(breakdown);
  if (!points.length && !stats.length) return null;
  return (
    <View style={styles.panel}>
      <Text style={[styles.panelTitle, { fontFamily: ui.bodyBold }]}>{localizeChrome("HOW YOU SCORED", language)}</Text>
      {points.map((row) => (
        <View key={row.label} style={styles.row} accessible accessibilityLabel={`${row.label}: ${row.value} points`}>
          <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{localizeChrome(row.label, language)}</Text>
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
              <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>
                {localizeChrome(s.label, language)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Tile({ value, label, color = colors.paper }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.statsSm, { color }]}>{value}</Text>
      <Text style={[type.micro, { color: colors.lilac, textAlign: "center" }]}>{label}</Text>
    </View>
  );
}

export function PostGameResultScreen({
  score,
  percentile,
  gameKey,
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
  coinsEarned = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const beaten = fakeBeatenCount(percentile, score);
  const { title: headline, celebrate } = resultHeadline({
    percentile: percentile === null ? null : beaten.pct,
    correct,
    attempts,
  });
  const shownScore = useCountUp(score);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const showAccuracy = attempts !== undefined && attempts > 0 && correct !== undefined;
  const accuracyPct = showAccuracy ? Math.round((correct / attempts) * 100) : 0;
  const { t, language, fonts: ui } = useLanguage();
  const { isSignedIn } = useAuth();
  const { wallet } = useApp();
  const sharePrompt = fill(celebrate ? t("resultSharePrompt") : t("resultSharePromptSoft"), { score });
  const beatenLabel = beaten.count.toLocaleString(language === "hi" ? "hi-IN" : "en-IN");
  const hitGameCap =
    isSignedIn &&
    coinsEarned <= 0 &&
    saveState === "saved" &&
    !!wallet &&
    wallet.gamesRewarded >= wallet.gamesRewardCap;

  async function shareScore() {
    capture("share_clicked", {
      button_location: "game_result",
      share_medium: "native_share",
      user_id: null,
    });
    capture("result_action_clicked", { action: "challenge" });
    capture("challenge_shared", {
      game_id: gameKey ?? null,
      score,
      share_method: "native_share",
    });
    setSharing(true);
    setShareError("");
    const brag = fill(t("shareBeat"), { score, title: gameTitle, count: beatenLabel, pct: beaten.pct });
    try {
      await Share.share({ message: `${brag}\n${APP_SHARE_URL}` });
    } catch {
      setShareError(t("shareFailed"));
    } finally {
      setSharing(false);
    }
  }

  const shareLabel = sharing ? t("openingShare") : shareError ? t("retryShare") : t("challengeFriend");

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        {/* Shareable hero: title + score + brag — kept above CTAs for clean screenshots */}
        <Text style={[type.metadata, styles.eyebrow]} numberOfLines={1}>
          {gameTitle.toUpperCase()} · {t("resultWord")}
        </Text>
        <Text style={[type.hero, { color: colors.paper, textAlign: "center", fontFamily: ui.display }]}>
          {localizeChrome(headline, language)}
        </Text>

        <View style={styles.hero} accessible accessibilityLabel={`Score ${score}`}>
          <Text style={[type.largeScore, { color: colors.lime }]}>{shownScore}</Text>
          <Text style={[type.micro, { color: colors.lilac, letterSpacing: 2 }]}>{t("pointsLabel")}</Text>
          {coinsEarned > 0 ? (
            <View style={styles.coinsEarned}>
              <CoinIcon size={18} />
              <Text style={[type.button, { color: colors.lime, fontFamily: ui.bodyBold }]}>
                {fill(t("coinsEarnedLine"), { count: coinsEarned })}
              </Text>
            </View>
          ) : hitGameCap ? (
            <View style={styles.coinsEarned}>
              <CoinIcon size={18} />
              <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{t("dailyGameCoinsDone")}</Text>
            </View>
          ) : !isSignedIn && saveState === "saved" ? (
            <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body, marginTop: spacing.sm, textAlign: "center" }]}>
              {t("signInAfterGame")}
            </Text>
          ) : null}
          <View style={styles.percentPill}>
            <Text style={[type.bodySm, { color: colors.ink, fontFamily: fonts.bodyBold }]}>
              {fill(t("betterThanPlayers"), { count: beatenLabel })}
            </Text>
          </View>
        </View>

        <Text style={[type.bodyLg, styles.sharePrompt, { fontFamily: ui.body }]}>{sharePrompt}</Text>

        {saveState !== "saved" ? (
          <View
            style={[styles.saveBanner, saveState === "rejected" && { borderColor: colors.pinkSoft }]}
            accessibilityRole="alert"
          >
            <Text style={[type.bodySm, { color: colors.paper, textAlign: "center" }]}>
              {saveMessage ??
                (saveState === "queued"
                  ? t("couldntSaveScore")
                  : "This score couldn't be recorded.")}
            </Text>
            {saveState === "queued" && onRetrySave ? (
              <PrimaryButton
                label={retryingSave ? t("saving") : t("trySavingNow")}
                variant="secondary"
                disabled={retryingSave}
                onPress={onRetrySave}
                icon="cloud-upload-outline"
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          {enableShare ? (
            <PrimaryButton
              label={shareLabel}
              onPress={() => void shareScore()}
              busy={sharing}
              icon="share-outline"
            />
          ) : null}
          {onPlayAgain ? (
            <PrimaryButton
              label={t("playAgain")}
              variant="secondary"
              onPress={() => {
                capture("result_action_clicked", { action: "replay" });
                onPlayAgain();
              }}
              icon="refresh"
            />
          ) : null}
          {shareError ? (
            <Text style={[type.metadata, { color: colors.pinkSoft, textAlign: "center" }]}>{shareError}</Text>
          ) : null}
          {onNextGame ? (
            <Pressable
              onPress={() => {
                capture("result_action_clicked", { action: "next game" });
                onNextGame();
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.feedLink}
            >
              <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.bodyBold }]}>
                {t("nextGame")} →
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                capture("result_action_clicked", { action: "feed" });
                onBackToFeed();
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.feedLink}
            >
              <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.bodyBold }]}>{t("backToFeed")}</Text>
            </Pressable>
          )}
          {onNextGame ? (
            <Pressable onPress={onBackToFeed} accessibilityRole="button" hitSlop={8} style={styles.feedLinkSubtle}>
              <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.body }]}>{t("backToFeed")}</Text>
            </Pressable>
          ) : null}
        </View>

        {showAccuracy || (rounds && rounds.length > 0) ? (
          <View style={styles.tiles}>
            {showAccuracy ? (
              <Tile value={`${accuracyPct}%`} label={`ACCURACY\n${correct}/${attempts} RIGHT`} color={colors.limeLive} />
            ) : null}
            {rounds && rounds.length > 0 ? <Tile value={String(rounds.length)} label={t("roundsLabel")} /> : null}
          </View>
        ) : null}

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
      </ScrollView>
      <Confetti active={celebrate} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: spacing.margin,
    gap: spacing.sm,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: colors.lilac,
    letterSpacing: 2,
    fontFamily: fonts.bodyBold,
  },
  hero: {
    width: "100%",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sharePrompt: {
    color: colors.paper,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  coinsEarned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
  },
  percentPill: {
    marginTop: spacing.sm,
    backgroundColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tiles: { flexDirection: "row", gap: spacing.sm, width: "100%", marginTop: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
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
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.md },
  feedLink: { alignSelf: "center", paddingVertical: spacing.sm },
  feedLinkSubtle: { alignSelf: "center", paddingBottom: spacing.xs },
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
