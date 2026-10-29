import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { api, FeedMoment, formatCount, isShareCancelled, shareErrorMessage, ShareCardResponse } from "../../api";
import { ActionRail } from "../../components/ActionRail";
import { AnswerButton } from "../../components/AnswerButton";
import { CommentsSheet } from "../../components/CommentsSheet";
import { LivePill } from "../../components/MajaLogo";
import { ScreenLoading } from "../../components/ScreenLoading";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { momentStatus, pairUp } from "../../lib/momentCard";
import { promptTextStyle } from "../../lib/promptSize";
import { seededCount, withSeededCrowd } from "../../lib/seededEngagement";
import { recordShare, setLike } from "../../lib/social";
import { ensureLocalShareUri } from "../../lib/shareLocalFile";
import { useMountedRef } from "../../lib/useMounted";
import { useLanguage } from "../../context/LanguageContext";
import { categoryName } from "../../i18n/categories";
import { fill } from "../../i18n/strings";
import { capture } from "../../lib/analytics";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const POLL_MS = 3000;
const PROMPT_LINES = 5;

type Props = {
  item: FeedMoment;
  height: number;
  isActive: boolean;
  onSignIn?: () => void;
};

export function MomentFeedPage({ item, height, isActive, onSignIn }: Props) {
  const { t, language, fonts: ui } = useLanguage();
  const { respond, isResponding, engagementFor, updateEngagement } = useApp();
  const { isSignedIn } = useAuth();
  const mounted = useMountedRef();
  const engagement = engagementFor(item);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const likeInflight = useRef(false);
  const pollInflight = useRef(false);
  const [local, setLocal] = useState(item);
  const [respondError, setRespondError] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareInflight = useRef(false);
  const answered = Boolean(local.myOptionId);
  const submitting = isResponding(item.id);
  const crowd = withSeededCrowd(local);
  const total = crowd.totalResponses;
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
      if (!isQuiz) {
        capture("poll_voted", {
          poll_id: item.id,
          category: local.category?.slug ?? null,
        });
      }
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

  async function toggleLike() {
    if (likeInflight.current) return;
    likeInflight.current = true;
    const before = { likedByMe: engagement.likedByMe, likes: engagement.likes };
    const next = !before.likedByMe;
    updateEngagement(item.id, { likedByMe: next, likes: Math.max(0, before.likes + (next ? 1 : -1)) });
    try {
      const res = await setLike(item.id, next);
      updateEngagement(item.id, { likedByMe: res.liked, likes: res.likes });
    } catch {
      updateEngagement(item.id, before);
    } finally {
      likeInflight.current = false;
    }
  }

  const onCommentTotal = useCallback(
    (comments: number) => updateEngagement(item.id, { comments }),
    [item.id, updateEngagement],
  );

  async function handleShare() {
    if (shareInflight.current || sharing) return;
    capture("share_clicked", {
      button_location: "moment_feed",
      share_medium: "image_card",
      user_id: null,
    });
    shareInflight.current = true;
    setSharing(true);
    setShareError("");
    try {
      const card = await api<ShareCardResponse>(`/v1/moments/${item.id}/share-card`, { method: "POST" });
      if (!(await Sharing.isAvailableAsync())) {
        if (mounted.current) setShareError(t("sharingUnavailable"));
        return;
      }
      const localUri = await ensureLocalShareUri(card.assetUrl, `moment-${item.id}.png`);
      await Sharing.shareAsync(localUri, { mimeType: "image/png", UTI: "public.png" });
      recordShare(item.id)
        .then((r) => updateEngagement(item.id, { shares: r.shares }))
        .catch(() => {});
    } catch (e) {
      if (mounted.current && !isShareCancelled(e)) {
        setShareError(shareErrorMessage(e));
      }
    } finally {
      if (mounted.current) setSharing(false);
      shareInflight.current = false;
    }
  }

  const tagLabel = contentTag?.name
    ? categoryName(contentTag.slug, contentTag.name, language)
    : answered
      ? t("hotTake")
      : categoryName(local.category?.slug, local.category?.name ?? "", language) || t("liveTag");
  const correctId = local.result?.correctOptionId;
  const disagreeingFriend = answered
    ? local.friends?.find((f) => f.optionId && f.optionId !== local.myOptionId)
    : undefined;
  const imageOptions = local.options.some((o) => Boolean(o.imageUrl));
  const crowded = Boolean(local.promptImageUrl) || imageOptions || local.options.length > 3;
  const promptStyle = promptTextStyle(local.prompt, { crowded });
  const status = momentStatus(
    {
      respondError,
      shareError,
      answered,
      isQuiz,
      gotItRight: Boolean(correctId) && local.myOptionId === correctId,
      correctKnown: Boolean(correctId),
      friend: disagreeingFriend
        ? {
            name: disagreeingFriend.displayName,
            choice: local.options.find((o) => o.id === disagreeingFriend.optionId)?.label ?? t("somethingElse"),
          }
        : null,
      myChoice: myOption ? (myOption.label ?? t("selected")) : null,
    },
    {
      pickQuizAnswer: t("pickQuizAnswer"),
      pickPollAnswer: t("pickPollAnswer"),
      correctExclaim: t("correctExclaim"),
      notThisTime: t("notThisTime"),
      friendChose: t("friendChose"),
      yourAnswer: t("yourAnswer"),
    },
  );

  function renderOption(o: FeedMoment["options"][number], tile: boolean) {
    if (!answered) {
      return (
        <AnswerButton
          key={o.id}
          label={o.label}
          imageUrl={o.imageUrl}
          tile={tile}
          compact={local.options.length > 4}
          disabled={submitting}
          onPress={() => void pick(o.id)}
        />
      );
    }
    const count = crowd.optionCounts[o.id] ?? 0;
    const isCorrect = correctId === o.id;
    const isMine = local.myOptionId === o.id;
    return (
      <AnswerButton
        key={o.id}
        label={o.label}
        imageUrl={o.imageUrl}
        tile={tile}
        compact={local.options.length > 4}
        percent={total > 0 ? Math.round((count / total) * 100) : 0}
        selected={isMine}
        correct={isQuiz ? isCorrect : false}
        incorrect={isQuiz && isMine && !isCorrect}
        disabled
        showCheck={isMine || (isQuiz && isCorrect)}
      />
    );
  }

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
            <Text style={[type.metadata, styles.hotTagText, { fontFamily: ui.bodyBold }]}>
              {contentTag?.slug === "quiz" ? `📝 ${t("quizTag")}` : contentTag?.slug === "poll" ? `📊 ${t("pollTag")}` : `🔥 ${tagLabel}`}
            </Text>
          </View>
          <LivePill count={total} label={fill(t("playingNow"), { count: formatCount(total) })} />
        </View>

        <View style={[styles.card, !imageOptions && styles.cardCentered]}>
          {answered ? <View style={styles.cardGlow} /> : null}
          {local.category ? (
            <Text style={[type.metadata, styles.categoryHint, { fontFamily: ui.bodyMedium }]}>
              {categoryName(local.category.slug, local.category.name, language).toUpperCase()}
            </Text>
          ) : null}
          {local.promptImageUrl ? (
            <Image
              source={{ uri: local.promptImageUrl }}
              style={[styles.promptImage, (imageOptions || local.options.length > 3) && styles.promptImageCompact]}
              resizeMode="contain"
            />
          ) : null}
          <Text
            style={[type.gameQuestion, styles.prompt, promptStyle, { fontFamily: ui.display }]}
            numberOfLines={PROMPT_LINES}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {local.prompt}
          </Text>
          <View style={styles.status}>
            {status ? (
              <Text
                style={[type.bodyLg, styles.statusText, { color: STATUS_COLOR[status.tone], fontFamily: ui.body }]}
                numberOfLines={2}
                accessibilityRole={status.tone === "error" ? "alert" : undefined}
              >
                {status.text}
              </Text>
            ) : null}
          </View>
          {imageOptions ? (
            <View style={styles.grid}>
              {pairUp(local.options).map((row) => (
                <View key={row[0].id} style={styles.gridRow}>
                  {row.map((o) => renderOption(o, true))}
                  {row.length === 1 ? <View style={styles.gridSpacer} /> : null}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.list}>{local.options.map((o) => renderOption(o, false))}</View>
          )}
          {submitting && !answered ? (
            <View style={styles.submitOverlay}>
              <ScreenLoading label={t("submitting")} style={{ flex: 0, backgroundColor: "transparent" }} />
            </View>
          ) : null}
        </View>

        <ActionRail
          likes={seededCount(item.id, "likes") + engagement.likes}
          liked={engagement.likedByMe}
          onToggleLike={() => void toggleLike()}
          comments={engagement.comments}
          onComments={() => setCommentsOpen(true)}
          shares={seededCount(item.id, "shares") + engagement.shares}
          onShare={() => void handleShare()}
          shareDisabled={sharing}
          shareLoading={sharing}
        />
        <CommentsSheet
          momentId={item.id}
          visible={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          isSignedIn={isSignedIn}
          onSignIn={onSignIn}
          onTotalChange={onCommentTotal}
        />
      </View>
    </View>
  );
}

const STATUS_COLOR = { error: colors.pink, good: colors.lime, muted: colors.lilac } as const;

const styles = StyleSheet.create({
  page: {
    width: "100%",
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.margin,
    paddingTop: 100,
    paddingBottom: spacing.lg,
  },
  content: { flex: 1, gap: spacing.md },
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
  categoryHint: { color: colors.lilac, textAlign: "center", letterSpacing: 1.5, marginBottom: spacing.sm },
  card: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    overflow: "hidden",
  },
  cardCentered: { justifyContent: "center" },
  submitOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(21,14,43,0.55)",
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 64,
    flexShrink: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.ink,
  },
  promptImageCompact: { height: 110 },
  prompt: { color: colors.paper, textAlign: "center" },
  status: { minHeight: 48, justifyContent: "center", marginVertical: spacing.xs },
  statusText: { textAlign: "center" },
  grid: { flex: 1, minHeight: 0, gap: spacing.sm },
  gridRow: { flex: 1, minHeight: 0, flexDirection: "row", gap: spacing.sm },
  gridSpacer: { flex: 1 },
  list: { flexShrink: 1, minHeight: 0 },
});
