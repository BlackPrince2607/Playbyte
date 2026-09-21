import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { api, FeedMoment, formatCount, isShareCancelled, shareErrorMessage, ShareCardResponse } from "../../api";
import { ActionRail } from "../../components/ActionRail";
import { AnswerButton } from "../../components/AnswerButton";
import { FriendAvatars } from "../../components/FriendAvatars";
import { LivePill } from "../../components/PlayLogo";
import { FriendChoiceStrip } from "../../components/StitchPrimitives";
import { useApp } from "../../context/AppContext";
import { useMountedRef } from "../../lib/useMounted";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const POLL_MS = 3000;

type Props = {
  item: FeedMoment;
  height: number;
  isActive: boolean;
};

export function MomentFeedPage({ item, height, isActive }: Props) {
  const { respond, isResponding, friendAvatars } = useApp();
  const mounted = useMountedRef();
  const pollInflight = useRef(false);
  const [local, setLocal] = useState(item);
  const [respondError, setRespondError] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareInflight = useRef(false);
  const answered = Boolean(local.myOptionId);
  const submitting = isResponding(item.id);
  const total = local.result?.totalResponses ?? 0;
  const volume = local.result?.volumeState;
  const isQuiz = local.tags?.some((t) => t.slug === "quiz") ?? local.scoringMode === "correct_option";
  const contentTag = local.tags?.[0];
  const myOption = local.options.find((o) => o.id === local.myOptionId);

  useEffect(() => {
    setLocal(item);
    setRespondError("");
    setShareError("");
  }, [item]);

  useEffect(() => {
    if (!isActive || !answered) return;

    let cancelled = false;

    async function pollOnce() {
      if (cancelled || pollInflight.current) return;
      pollInflight.current = true;
      try {
        const snap = await api<{
          totalResponses: number;
          optionCounts: Record<string, number>;
          correctOptionId?: string | null;
        }>(`/v1/moments/${item.id}/result`);
        if (!mounted.current || cancelled) return;
        setLocal((prev) => ({
          ...prev,
          result: {
            totalResponses: snap.totalResponses,
            optionCounts: snap.optionCounts,
            volumeState: prev.result?.volumeState,
            joinedLastMinute: prev.result?.joinedLastMinute,
            correctOptionId: snap.correctOptionId ?? prev.result?.correctOptionId,
          },
        }));
      } catch {
        /* polling is best-effort */
      } finally {
        pollInflight.current = false;
      }
    }

    void pollOnce();
    const id = setInterval(() => void pollOnce(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isActive, answered, item.id, mounted]);

  async function pick(optionId: string) {
    if (answered || submitting) return;
    setRespondError("");
    const outcome = await respond(item.id, optionId);
    if (!mounted.current) return;
    if (outcome.ok) {
      setLocal((prev) => ({
        ...prev,
        myOptionId: optionId,
        result: outcome.result
          ? {
              totalResponses: outcome.result.totalResponses,
              optionCounts: outcome.result.optionCounts,
              volumeState: outcome.result.volumeState,
              joinedLastMinute: outcome.result.joinedLastMinute,
              correctOptionId: outcome.result.correctOptionId,
            }
          : prev.result,
      }));
    } else {
      setRespondError(outcome.message);
    }
  }

  async function handleShare() {
    if (shareInflight.current || sharing) return;
    shareInflight.current = true;
    setSharing(true);
    setShareError("");
    try {
      const card = await api<ShareCardResponse>(`/v1/moments/${item.id}/share-card`, { method: "POST" });
      if (!(await Sharing.isAvailableAsync())) {
        if (mounted.current) setShareError("Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(card.assetUrl);
    } catch (e) {
      if (mounted.current && !isShareCancelled(e)) {
        setShareError(shareErrorMessage(e));
      }
    } finally {
      if (mounted.current) setSharing(false);
      shareInflight.current = false;
    }
  }

  const momentFriends = local.friends?.map((f) => ({ displayName: f.displayName, avatarKey: f.avatarKey })) ?? [];
  const friends = momentFriends.length > 0 ? momentFriends : friendAvatars.slice(0, 2);
  const tagLabel = contentTag?.name?.toUpperCase() ?? (answered ? "HOT TAKE" : local.category?.name?.toUpperCase() ?? "LIVE");
  const correctId = local.result?.correctOptionId;
  const disagreeingFriend = answered
    ? local.friends?.find((f) => f.optionId && f.optionId !== local.myOptionId)
    : undefined;
  const disagreeChoice = disagreeingFriend
    ? local.options.find((o) => o.id === disagreeingFriend.optionId)?.label ?? "something else"
    : null;

  return (
    <View style={[styles.page, { height }]}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink }]} />
        {local.promptImageUrl ? (
          <Image source={{ uri: local.promptImageUrl }} style={StyleSheet.absoluteFill} blurRadius={20} />
        ) : null}
        <LinearGradient
          colors={["rgba(255,77,141,0.12)", "transparent", "rgba(21,14,43,0.95)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={[styles.hotTag, contentTag?.slug === "quiz" && styles.quizTag]}>
            <Text style={[type.metadata, styles.hotTagText, { fontFamily: fonts.bodyBold }]}>
              {contentTag?.slug === "quiz" ? "📝 QUIZ" : contentTag?.slug === "poll" ? "📊 POLL" : `🔥 ${tagLabel}`}
            </Text>
          </View>
          <LivePill
            count={total}
            label={volume === "nascent" ? "Be the first 50" : `${formatCount(total)} playing now`}
          />
        </View>

        {answered ? (
          <View style={styles.resultCard}>
            <View style={styles.cardGlow} />
            {local.promptImageUrl ? (
              <Image source={{ uri: local.promptImageUrl }} style={styles.promptImage} resizeMode="cover" />
            ) : null}
            <Text style={[type.gameQuestion, styles.prompt]}>{local.prompt}</Text>
            {myOption ? (
              <View style={styles.yourAnswer}>
                <Text style={[type.metadata, { color: colors.lime }]}>
                  Your answer: {myOption.label ?? "Selected"}
                </Text>
              </View>
            ) : null}
            {isQuiz && correctId ? (
              <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", marginBottom: spacing.md }]}>
                {local.myOptionId === correctId ? "Correct!" : "Not this time — see the right answer below."}
              </Text>
            ) : null}
            {submitting ? <ActivityIndicator color={colors.lime} /> : null}
            {respondError ? (
              <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]} accessibilityRole="alert">
                {respondError}
              </Text>
            ) : null}
            <View style={styles.options}>
              {local.options.map((o) => {
                const count = local.result?.optionCounts?.[o.id] ?? 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const isCorrect = correctId === o.id;
                const isMine = local.myOptionId === o.id;
                return (
                  <AnswerButton
                    key={o.id}
                    label={o.label}
                    imageUrl={o.imageUrl}
                    percent={pct}
                    selected={isMine}
                    correct={isQuiz ? isCorrect : false}
                    incorrect={isQuiz && isMine && !isCorrect}
                    disabled
                    showCheck={isMine || (isQuiz && isCorrect)}
                  />
                );
              })}
            </View>
            {disagreeingFriend && disagreeChoice ? (
              <View style={{ marginTop: spacing.md }}>
                <FriendChoiceStrip
                  name={disagreeingFriend.displayName}
                  choice={disagreeChoice}
                  onChallenge={() => void handleShare()}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.playCard}>
            {local.category ? (
              <Text style={[type.micro, styles.categoryHint]}>{local.category.name.toUpperCase()}</Text>
            ) : null}
            {local.promptImageUrl ? (
              <Image source={{ uri: local.promptImageUrl }} style={styles.promptImage} resizeMode="cover" />
            ) : null}
            <Text style={[type.gameQuestion, styles.prompt]}>{local.prompt}</Text>
            {submitting ? (
              <ActivityIndicator color={colors.lime} style={{ marginVertical: spacing.sm }} accessibilityLabel="Submitting" />
            ) : null}
            {respondError ? (
              <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]} accessibilityRole="alert">
                {respondError}
              </Text>
            ) : null}
            <View style={styles.options}>
              {local.options.map((o) => (
                <AnswerButton
                  key={o.id}
                  label={o.label}
                  imageUrl={o.imageUrl}
                  disabled={submitting}
                  onPress={() => void pick(o.id)}
                />
              ))}
            </View>
          </View>
        )}

        {shareError ? (
          <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]} accessibilityRole="alert">
            {shareError}
          </Text>
        ) : null}

        {friends.length > 0 ? (
          <FriendAvatars friends={friends} extraCount={Math.max(0, total - friends.length)} />
        ) : null}

        <ActionRail
          responses={total}
          onShare={() => void handleShare()}
          onChallenge={() => void handleShare()}
          shareDisabled={sharing}
          shareLoading={sharing}
        />

        <Text style={[type.metadata, styles.swipeHint]}>Swipe up for next play</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.margin,
    paddingTop: 100,
    paddingBottom: 100,
  },
  content: { flex: 1, justifyContent: "space-between", gap: spacing.md },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  hotTag: {
    backgroundColor: colors.pink,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  quizTag: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.lime },
  hotTagText: { color: colors.paper, letterSpacing: 1 },
  categoryHint: { color: colors.lilac, textAlign: "center", letterSpacing: 1.5 },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    flexGrow: 1,
    overflow: "hidden",
  },
  playCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    flexGrow: 1,
  },
  cardGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(255,77,141,0.12)",
  },
  promptImage: {
    width: "100%",
    height: 160,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  prompt: { color: colors.paper, textAlign: "center", marginVertical: spacing.md },
  yourAnswer: {
    alignSelf: "center",
    backgroundColor: "rgba(198,255,61,0.1)",
    borderColor: "rgba(198,255,61,0.2)",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  options: { width: "100%" },
  swipeHint: { color: colors.lilac, textAlign: "center", marginTop: spacing.sm },
});
