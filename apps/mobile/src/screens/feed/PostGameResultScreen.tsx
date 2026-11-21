import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "../../components/AvatarImage";
import { CoinIcon } from "../../components/CoinIcon";
import { FriendPickerModal } from "../../components/FriendPickerModal";
import { PrimaryButton } from "../../components/PrimaryButton";
import { isRatePromptPlatform, RateAppModal } from "../../components/RateAppModal";
import { StreakRitualModal } from "../../components/StreakRitualModal";
import { WhatsAppGroupModal } from "../../components/WhatsAppGroupModal";
import { ResultBar } from "../../components/StitchPrimitives";
import { prefersReducedMotion } from "../../game/ui/feedback";
import { Confetti } from "../../game/ui/motion";
import { fakeBeatenCount, resultHeadline, scoreRows, statRows } from "../../game/ui/resultSummary";
import type { ChallengeResultSummary, MatchResultSummary, SaveState } from "../../game/session/submitQueue";
import type { RoundRecord } from "../../game/session/types";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { localizeChrome } from "../../i18n/chrome";
import { fill } from "../../i18n/strings";
import { capture } from "../../lib/analytics";
import { createChallenge } from "../../lib/challenges";
import { APP_SHARE_URL, PLAY_STORE_URL, WHATSAPP_GROUP_URL } from "../../lib/links";
import { getMatch } from "../../lib/matchmaking";
import {
  markFriendChallengePromptShown,
  markStreakRitualShown,
  shouldShowFriendChallengePrompt,
  shouldShowStreakRitual,
} from "../../lib/retentionStorage";
import { shareAppInvite } from "../../lib/shareInvite";
import { ensureLocalShareUri } from "../../lib/shareLocalFile";
import { enableStreakReminder } from "../../lib/streakReminders";
import {
  markRatePromptShown,
  markWhatsAppPromptShown,
  shouldShowRatePrompt,
  shouldShowWhatsAppPrompt,
} from "../../lib/storage";
import { api, isApiError, isShareCancelled, shareErrorMessage, ShareCardResponse } from "../../api";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

/** Let the score count-up settle before the soft Play Store ask. */
const RATE_PROMPT_DELAY_MS = 1600;
/** WhatsApp community ask — slightly later so it never stacks with the rate sheet. */
const WHATSAPP_PROMPT_DELAY_MS = 2200;

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
  /** When true, shows Share CTA — image card when the play is saved, else text. */
  enableShare?: boolean;
  optionBreakdown?: { label: string; percent: number; highlight?: boolean }[];
  correct?: number;
  attempts?: number;
  rounds?: RoundRecord[];
  scoreBreakdown?: Record<string, number>;
  coinsEarned?: number;
  playId?: string;
  playSeed?: string;
  challengeSummary?: ChallengeResultSummary;
  matchSummary?: MatchResultSummary;
  onPlayOnline?: () => void;
  onRematch?: () => void | Promise<void>;
  onSignIn?: () => void;
  /** Called when match poll finds the opponent finished. */
  onMatchUpdated?: (match: MatchResultSummary) => void;
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
  const { t, fonts: ui } = useLanguage();
  const top = Math.max(1, ...rounds.map((r) => r.points));
  const dense = rounds.length > 12;
  return (
    <View style={styles.panel}>
      <Text style={[styles.panelTitle, { fontFamily: ui.bodyBold }]}>{t("roundByRound")}</Text>
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

function RaceTrack({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.raceTrack}>
      <View style={[styles.raceFill, { width: `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function DuelScoreCard({
  myScore,
  theirScore,
  myName,
  theirName,
  myAvatar,
  theirAvatar,
  waiting,
}: {
  myScore: number;
  theirScore: number | null | undefined;
  myName: string;
  theirName: string;
  myAvatar?: string | null;
  theirAvatar?: string | null;
  waiting: boolean;
}) {
  const { t } = useLanguage();
  const [pulse, setPulse] = useState(0.55);

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setPulse((p) => (p >= 0.92 ? 0.45 : p + 0.08)), 180);
    return () => clearInterval(id);
  }, [waiting]);

  const theirDone = theirScore != null;
  const max = Math.max(myScore, theirScore ?? 0, 1);
  const myPct = theirDone ? myScore / max : 1;
  const theirPct = theirDone ? (theirScore ?? 0) / max : pulse;

  return (
    <View style={styles.duelCard}>
      {waiting ? (
        <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: fonts.body }]}>
          {fill(t("waitingForOpponent"), { name: theirName })}
        </Text>
      ) : null}

      <View style={styles.duelPlayers}>
        <View style={styles.duelCol}>
          <View style={[styles.duelPfp, { borderColor: surface.lime }]}>
            <AvatarImage displayName={myName} avatarKey={myAvatar} size={64} />
          </View>
          <Text style={[styles.duelName, { color: surface.lime }]} numberOfLines={1}>
            {myName}
          </Text>
          <Text style={[type.largeScore, { color: colors.paper, fontSize: 36, lineHeight: 42 }]}>{myScore}</Text>
          <RaceTrack pct={myPct} color={surface.lime} />
        </View>

        <Text style={styles.duelVs}>VS</Text>

        <View style={styles.duelCol}>
          <View style={[styles.duelPfp, { borderColor: colors.pink }]}>
            <AvatarImage displayName={theirName} avatarKey={theirAvatar} size={64} />
          </View>
          <Text style={[styles.duelName, { color: colors.pink }]} numberOfLines={1}>
            {theirName}
          </Text>
          <Text style={[type.largeScore, { color: colors.paper, fontSize: 36, lineHeight: 42 }]}>
            {theirDone ? theirScore : "—"}
          </Text>
          <RaceTrack pct={theirPct} color={colors.pink} />
        </View>
      </View>

      {waiting ? (
        <Text style={[type.micro, { color: colors.lilac, textAlign: "center", marginTop: spacing.sm }]}>
          {t("finishingMatch")}
        </Text>
      ) : null}
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
  playId,
  playSeed,
  challengeSummary,
  matchSummary,
  onPlayOnline,
  onRematch,
  onSignIn,
  onMatchUpdated,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyFriend, setBusyFriend] = useState<string | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [ratePromptOpen, setRatePromptOpen] = useState(false);
  const [whatsappPromptOpen, setWhatsappPromptOpen] = useState(false);
  const [streakRitualOpen, setStreakRitualOpen] = useState(false);
  const [ritualBusy, setRitualBusy] = useState(false);
  const [friendPrompt, setFriendPrompt] = useState(false);
  const [liveMatch, setLiveMatch] = useState<MatchResultSummary | null>(matchSummary ?? null);
  const shareInflight = useRef(false);
  /** Keeps the WhatsApp sheet from stacking on the same visit as the rate ask. */
  const ratePromptClaimedRef = useRef(false);
  const streakRitualClaimedRef = useRef(false);
  const showAccuracy = attempts !== undefined && attempts > 0 && correct !== undefined;
  const accuracyPct = showAccuracy ? Math.round((correct / attempts) * 100) : 0;
  const { t, language, fonts: ui } = useLanguage();
  const { isSignedIn, user } = useAuth();
  const { wallet, friends, refreshFriends, me, streak } = useApp();
  const sharePrompt = fill(celebrate ? t("resultSharePrompt") : t("resultSharePromptSoft"), { score });
  const beatenLabel = beaten.count.toLocaleString(language === "hi" ? "hi-IN" : "en-IN");
  const hitGameCap =
    isSignedIn &&
    coinsEarned <= 0 &&
    saveState === "saved" &&
    !!wallet &&
    wallet.gamesRewarded >= wallet.gamesRewardCap;

  useEffect(() => {
    setLiveMatch(matchSummary ?? null);
  }, [matchSummary]);

  // Day-0 streak ritual first — highest retention priority after the first finished game.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!(await shouldShowStreakRitual()) || cancelled) return;
          streakRitualClaimedRef.current = true;
          await markStreakRitualShown();
          if (cancelled) return;
          setStreakRitualOpen(true);
          capture("streak_ritual_shown", { streak_count: streak });
        } catch {
          /* storage failure — skip quietly */
        }
      })();
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [streak]);

  // Soft friend-challenge / invite nudge after a strong score (once).
  useEffect(() => {
    if (matchSummary || challengeSummary) return;
    const strong = celebrate || (percentile !== null && percentile >= 50) || score >= 80;
    if (!strong || !gameKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!(await shouldShowFriendChallengePrompt()) || cancelled) return;
          if (streakRitualClaimedRef.current || streakRitualOpen) return;
          await markFriendChallengePromptShown();
          if (cancelled) return;
          setFriendPrompt(true);
          capture("friend_challenge_prompt_shown", {
            has_friends: friends.length > 0,
            score,
          });
        } catch {
          /* ignore */
        }
      })();
    }, 1400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [celebrate, percentile, score, gameKey, matchSummary, challengeSummary, streakRitualOpen, friends.length]);

  // One-time soft Play Store ask — yield to streak ritual on the same visit.
  useEffect(() => {
    if (!isRatePromptPlatform()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!(await shouldShowRatePrompt()) || cancelled) return;
          if (streakRitualClaimedRef.current || streakRitualOpen) return;
          ratePromptClaimedRef.current = true;
          await markRatePromptShown();
          if (cancelled) return;
          setRatePromptOpen(true);
          capture("result_action_clicked", { action: "rate_prompt_shown" });
        } catch {
          /* storage failure — skip quietly */
        }
      })();
    }, RATE_PROMPT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [streakRitualOpen]);

  // One-time WhatsApp community ask — skip this visit if ritual/rate is taking the slot.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!(await shouldShowWhatsAppPrompt()) || cancelled) return;
          if (streakRitualClaimedRef.current || streakRitualOpen) return;
          if (ratePromptClaimedRef.current || ratePromptOpen) return;
          if (isRatePromptPlatform() && (await shouldShowRatePrompt())) return;
          await markWhatsAppPromptShown();
          if (cancelled) return;
          setWhatsappPromptOpen(true);
          capture("result_action_clicked", { action: "whatsapp_prompt_shown" });
        } catch {
          /* storage failure — skip quietly */
        }
      })();
    }, WHATSAPP_PROMPT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [streakRitualOpen, ratePromptOpen]);

  // Poll until the opponent (often a bot) submits — fixes "Waiting for Kian…" forever.
  useEffect(() => {
    const id = liveMatch?.id ?? matchSummary?.id;
    if (!id) return;
    const waiting =
      (liveMatch ?? matchSummary)?.theirScore == null &&
      (liveMatch ?? matchSummary)?.status !== "forfeit" &&
      (liveMatch ?? matchSummary)?.status !== "expired" &&
      (liveMatch ?? matchSummary)?.status !== "completed";
    if (!waiting) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const m = await getMatch(id);
        if (cancelled) return;
        const next: MatchResultSummary = {
          id: m.id,
          status: m.status,
          myScore: m.myScore ?? liveMatch?.myScore ?? score,
          theirScore: m.theirScore,
          opponentName: m.opponent?.displayName ?? liveMatch?.opponentName,
          opponentAvatarKey: m.opponent?.avatarKey ?? liveMatch?.opponentAvatarKey ?? null,
        };
        setLiveMatch(next);
        onMatchUpdated?.(next);
      } catch {
        /* keep waiting UI */
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [liveMatch?.id, liveMatch?.theirScore, liveMatch?.status, matchSummary?.id, onMatchUpdated, score]);

  const duel = liveMatch ?? matchSummary ?? challengeSummary;
  const isDuel = !!duel;
  const myChallengeScore = duel?.myScore ?? score;
  const theirChallengeScore = duel?.theirScore;
  const waitingOnOpponent =
    !!duel &&
    theirChallengeScore == null &&
    duel.status !== "forfeit" &&
    duel.status !== "expired" &&
    duel.status !== "completed";
  const vsOutcome =
    theirChallengeScore != null && duel?.opponentName
      ? myChallengeScore === theirChallengeScore
        ? t("challengeTie")
        : myChallengeScore > theirChallengeScore
          ? t("challengeYouWon")
          : t("challengeYouLost")
      : null;

  async function shareTextScore() {
    const brag = fill(t("shareBeat"), { score, title: gameTitle, count: beatenLabel, pct: beaten.pct });
    await Share.share({ message: `${brag}\n${APP_SHARE_URL}` });
  }

  async function shareScore() {
    if (shareInflight.current || sharing) return;
    const canCard = Boolean(gameKey && playId && saveState === "saved");
    capture("share_clicked", {
      button_location: "game_result",
      share_medium: canCard ? "image_card" : "native_share",
      user_id: user?.id ?? null,
    });
    capture("result_action_clicked", { action: "share" });
    shareInflight.current = true;
    setSharing(true);
    setShareError("");
    try {
      if (canCard && gameKey && playId) {
        const card = await api<ShareCardResponse>(`/v1/games/${gameKey}/plays/${playId}/share-card`, {
          method: "POST",
        });
        if (!(await Sharing.isAvailableAsync())) {
          await shareTextScore();
          return;
        }
        const localUri = await ensureLocalShareUri(card.assetUrl, `play-${playId}.png`);
        await Sharing.shareAsync(localUri, { mimeType: "image/png", UTI: "public.png" });
        return;
      }
      await shareTextScore();
    } catch (e) {
      if (isShareCancelled(e)) return;
      // Card API / download failed — fall back to text so share still works.
      if (canCard) {
        try {
          await shareTextScore();
          return;
        } catch {
          /* fall through */
        }
      }
      setShareError(shareErrorMessage(e) || t("shareFailed"));
    } finally {
      setSharing(false);
      shareInflight.current = false;
    }
  }

  async function sendChallenge(friendUserId: string, friendName: string) {
    if (!gameKey) return;
    setBusyFriend(friendUserId);
    try {
      await createChallenge({
        opponentUserId: friendUserId,
        gameKey,
        playId: saveState === "saved" ? playId : undefined,
        seed: playSeed,
        score,
        shareMethod: "in_app_friend",
      });
      capture("result_action_clicked", { action: "challenge" });
      setPickerOpen(false);
      Alert.alert(t("challengeFriend"), fill(t("challengeSent"), { name: friendName }));
    } catch (e) {
      Alert.alert(t("challengeFriend"), isApiError(e) ? e.userMessage : t("challengeSendFailed"));
    } finally {
      setBusyFriend(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView
        contentContainerStyle={[
          styles.wrap,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <Text style={[type.metadata, styles.eyebrow]} numberOfLines={1}>
          {gameTitle.toUpperCase()} · {t("resultWord")}
        </Text>

        {isDuel && duel.opponentName ? (
          <>
            <Text style={[type.hero, { color: colors.paper, textAlign: "center", fontFamily: ui.display, fontSize: 32 }]}>
              {vsOutcome ?? (waitingOnOpponent ? t("finishingMatch") : localizeChrome(headline, language))}
            </Text>
            <DuelScoreCard
              myScore={myChallengeScore}
              theirScore={theirChallengeScore}
              myName={me?.displayName ?? t("youName")}
              theirName={duel.opponentName}
              myAvatar={me?.avatarKey}
              theirAvatar={duel.opponentAvatarKey}
              waiting={waitingOnOpponent}
            />
          </>
        ) : (
          <>
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
                <Text
                  style={[type.bodySm, { color: colors.ink, fontFamily: fonts.bodyBold, textAlign: "center" }]}
                >
                  {fill(t("betterThanPlayers"), { count: beatenLabel })}
                </Text>
              </View>
            </View>
            <Text style={[type.bodyLg, styles.sharePrompt, { fontFamily: ui.body }]}>{sharePrompt}</Text>
          </>
        )}

        {isDuel && coinsEarned > 0 ? (
          <View style={styles.coinsEarned}>
            <CoinIcon size={18} />
            <Text style={[type.button, { color: colors.lime, fontFamily: ui.bodyBold }]}>
              {fill(t("coinsEarnedLine"), { count: coinsEarned })}
            </Text>
          </View>
        ) : null}

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
          {isDuel && onRematch && !waitingOnOpponent ? (
            <PrimaryButton
              label={rematchBusy ? t("sendingChallenge") : t("rematch")}
              busy={rematchBusy}
              onPress={() => {
                setRematchBusy(true);
                void Promise.resolve(onRematch())
                  .catch((e) => {
                    Alert.alert(t("rematch"), isApiError(e) ? e.userMessage : t("rematchFailed"));
                  })
                  .finally(() => setRematchBusy(false));
              }}
              icon="refresh-circle-outline"
            />
          ) : null}

          {friendPrompt && !isDuel && gameKey ? (
            <View style={styles.friendPrompt}>
              <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body, textAlign: "center" }]}>
                {friends.length > 0 ? t("challengeFriendPrompt") : t("inviteFriendPrompt")}
              </Text>
              <PrimaryButton
                label={friends.length > 0 ? t("challengeFriendCta") : t("inviteFriendCta")}
                variant="secondary"
                icon={friends.length > 0 ? "flash-outline" : "person-add-outline"}
                onPress={() => {
                  capture("friend_challenge_prompt_clicked", {
                    has_friends: friends.length > 0,
                  });
                  setFriendPrompt(false);
                  if (friends.length > 0) {
                    void refreshFriends();
                    setPickerOpen(true);
                  } else {
                    void shareAppInvite(user?.id, "result_friend_prompt");
                  }
                }}
              />
            </View>
          ) : null}

          {!isDuel && onPlayAgain ? (
            <PrimaryButton
              label={t("playAgain")}
              onPress={() => {
                capture("result_action_clicked", { action: "replay" });
                onPlayAgain();
              }}
              icon="refresh"
            />
          ) : null}

          {!isDuel && onNextGame ? (
            <PrimaryButton
              label={t("nextGame")}
              variant="secondary"
              onPress={() => {
                capture("result_action_clicked", { action: "next game" });
                onNextGame();
              }}
              trailingIcon="arrow-forward"
            />
          ) : null}

          <View style={styles.secondaryRow}>
            {enableShare ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void shareScore()}
                disabled={sharing}
                style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={[type.bodySm, { color: colors.paper, fontFamily: ui.bodyBold }]}>
                  {sharing ? t("openingShare") : t("shareScoreInstead")}
                </Text>
              </Pressable>
            ) : null}
            {!isDuel && gameKey ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void refreshFriends();
                  setPickerOpen(true);
                }}
                style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={[type.bodySm, { color: colors.paper, fontFamily: ui.bodyBold }]}>
                  {t("challenge")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                capture("result_action_clicked", { action: "feed" });
                onBackToFeed();
              }}
              style={({ pressed }) => [styles.ghostBtn, styles.ghostPrimary, pressed && { opacity: 0.85 }]}
            >
              <Text style={[type.bodySm, { color: colors.ink, fontFamily: ui.bodyBold }]}>{t("done")}</Text>
            </Pressable>
          </View>

          {shareError ? (
            <Text style={[type.metadata, { color: colors.pinkSoft, textAlign: "center" }]}>{shareError}</Text>
          ) : null}

          {/* Keep play-online as a quiet text link for solo results only */}
          {!isDuel && gameKey && onPlayOnline ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                capture("result_action_clicked", { action: "play_online" });
                onPlayOnline();
              }}
              style={{ paddingVertical: spacing.xs }}
            >
              <Text style={[type.micro, { color: colors.lilac, textAlign: "center", letterSpacing: 1 }]}>
                {t("playOnline").toUpperCase()}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {!isDuel && (showAccuracy || (rounds && rounds.length > 0)) ? (
          <View style={styles.tiles}>
            {showAccuracy ? (
              <Tile
                value={`${accuracyPct}%`}
                label={`${t("accuracyLabel")}\n${fill(t("correctOfAttempts"), { correct: correct!, attempts: attempts! })}`}
                color={colors.limeLive}
              />
            ) : null}
            {rounds && rounds.length > 0 ? <Tile value={String(rounds.length)} label={t("roundsLabel")} /> : null}
          </View>
        ) : null}

        {!isDuel && rounds && rounds.length > 1 ? <RoundBars rounds={rounds} /> : null}
        {!isDuel ? <ScoreComposition breakdown={scoreBreakdown} /> : null}

        {optionBreakdown && optionBreakdown.length > 0 ? (
          <View style={styles.panel}>
            <Text style={[styles.panelTitle, { fontFamily: ui.bodyBold }]}>{t("howCrowdVoted")}</Text>
            {optionBreakdown.map((o, i) => (
              <ResultBar key={o.label} label={o.label} percent={o.percent} highlight={o.highlight} delayMs={i * 60} />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Confetti active={celebrate || (!!vsOutcome && vsOutcome === t("challengeYouWon"))} />
      <FriendPickerModal
        visible={pickerOpen}
        friends={friends}
        signedIn={isSignedIn}
        busyUserId={busyFriend}
        onClose={() => setPickerOpen(false)}
        onSignIn={onSignIn}
        onSelect={(f) => void sendChallenge(f.userId, f.displayName)}
      />
      <RateAppModal
        visible={ratePromptOpen}
        onDismiss={() => {
          setRatePromptOpen(false);
          capture("result_action_clicked", { action: "rate_prompt_dismiss" });
        }}
        onRate={() => {
          setRatePromptOpen(false);
          capture("result_action_clicked", { action: "rate_prompt_open_store" });
          Linking.openURL(PLAY_STORE_URL).catch(() =>
            Alert.alert(t("couldntOpenLink"), PLAY_STORE_URL),
          );
        }}
      />
      <WhatsAppGroupModal
        visible={whatsappPromptOpen}
        onDismiss={() => {
          setWhatsappPromptOpen(false);
          capture("result_action_clicked", { action: "whatsapp_prompt_dismiss" });
        }}
        onJoin={() => {
          setWhatsappPromptOpen(false);
          capture("result_action_clicked", { action: "whatsapp_prompt_join" });
          Linking.openURL(WHATSAPP_GROUP_URL).catch(() =>
            Alert.alert(t("couldntOpenLink"), WHATSAPP_GROUP_URL),
          );
        }}
      />
      <StreakRitualModal
        visible={streakRitualOpen}
        streak={streak}
        busy={ritualBusy}
        onKeepPlaying={() => {
          setStreakRitualOpen(false);
          capture("streak_ritual_dismiss", { streak_count: streak });
        }}
        onRemind={() => {
          setRitualBusy(true);
          void (async () => {
            const ok = await enableStreakReminder({
              title: t("streakReminderTitle"),
              body: t("day0Appointment"),
            });
            capture("streak_ritual_remind", { granted: ok, streak_count: streak });
            setRitualBusy(false);
            setStreakRitualOpen(false);
            if (!ok) Alert.alert(t("notifications"), t("reminderPermissionDenied"));
          })();
        }}
      />
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
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  percentPill: {
    marginTop: spacing.sm,
    alignSelf: "stretch",
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
  friendPrompt: {
    width: "100%",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.md },
  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  ghostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardAlt,
    minHeight: 40,
    justifyContent: "center",
    flexShrink: 0,
  },
  ghostPrimary: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
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
  duelCard: {
    width: "100%",
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  duelPlayers: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  duelCol: { flex: 1, alignItems: "center", gap: 6 },
  duelPfp: {
    borderRadius: 36,
    borderWidth: 3,
    padding: 2,
  },
  duelName: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    textAlign: "center",
    maxWidth: "100%",
  },
  duelVs: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.lilac,
    marginTop: 40,
  },
  raceTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardAlt,
    overflow: "hidden",
    marginTop: 4,
  },
  raceFill: { height: 8, borderRadius: 4 },
});
