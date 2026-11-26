import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { api, FeedMoment, formatCount, isShareCancelled, shareErrorMessage, ShareCardResponse } from "../../api";
import { ActionRail } from "../../components/ActionRail";
import { AnswerButton } from "../../components/AnswerButton";
import { CommentsSheet } from "../../components/CommentsSheet";
import { LivePill } from "../../components/MajaLogo";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { displayCopy } from "../../lib/displayLang";
import { scoreLocalVote } from "../../lib/localResponses";
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
  const { respond, engagementFor, updateEngagement } = useApp();
  const { isSignedIn, user } = useAuth();
  const mounted = useMountedRef();
  const engagement = engagementFor(item);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const likeInflight = useRef(false);
  const pollInflight = useRef(false);
  const [local, setLocal] = useState(item);
  const [respondError, setRespondError] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const shareInflight = useRef(false);
  const answered = Boolean(local.myOptionId);
  const picking = Boolean(pendingOptionId);
  // Hold the pre-result card until we can paint the final state once — no score flash/swap.
  const showResults = answered && !picking;
  const crowd = withSeededCrowd(local);
  const total = crowd.totalResponses;
  const isQuiz =
    local.tags?.some((t) => t.slug === "quiz" || t.slug === "trivia") ??
    local.scoringMode === "correct_option";
  const contentTag = local.tags?.[0];
  const tagSlug = contentTag?.slug;
  const isTriviaTag = tagSlug === "trivia";
  const isQuizTag = tagSlug === "quiz" || (!contentTag && isQuiz);
  const myOption = local.options.find((o) => o.id === local.myOptionId);
  const selectedId = pendingOptionId ?? local.myOptionId ?? null;

  useEffect(() => {
    // Ignore optimistic feed patches while a pick is in flight — keeps the card steady.
    if (pendingOptionId) {
      if (
        isQuiz &&
        item.myOptionId === pendingOptionId &&
        item.result?.correctOptionId
      ) {
        setLocal(item);
        setPendingOptionId(null);
      }
      return;
    }
    setLocal(item);
    setRespondError("");
    setShareError("");
  }, [item, pendingOptionId, isQuiz]);

  useEffect(() => {
    if (!isActive || (!answered && !picking)) return;

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
        // Quiz: reveal only once the correct option is known.
        if (pendingOptionId && snap.correctOptionId) {
          setPendingOptionId(null);
        }
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
  }, [isActive, answered, picking, pendingOptionId, item.id, mounted]);

  async function pick(optionId: string) {
    if (answered || picking) return;
    setRespondError("");
    // Lock selection highlight only — do not paint scores until the final snapshot is ready.
    setPendingOptionId(optionId);
    if (!isQuiz) {
      capture("poll_voted", {
        poll_id: item.id,
        category: local.category?.slug ?? null,
      });
    }
    const outcome = await respond(item.id, optionId);
    if (!mounted.current) return;
    if (outcome.ok && outcome.result) {
      const snap = outcome.result;
      setLocal((prev) => ({
        ...prev,
        myOptionId: optionId,
        result: {
          totalResponses: snap.totalResponses,
          optionCounts: snap.optionCounts,
          volumeState: snap.volumeState,
          joinedLastMinute: snap.joinedLastMinute,
          correctOptionId: snap.correctOptionId,
        },
      }));
      // Quizzes stay on the selection card until the key arrives (poll effect clears pending).
      if (isQuiz && !snap.correctOptionId) return;
    } else {
      setLocal((prev) => scoreLocalVote(prev, optionId));
      if (!outcome.ok) void respond(item.id, optionId);
      // Still wait for the correct option before revealing a quiz.
      if (isQuiz) return;
    }
    setPendingOptionId(null);
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
      user_id: user?.id ?? null,
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
    : showResults
      ? t("hotTake")
      : categoryName(local.category?.slug, local.category?.name ?? "", language) || t("liveTag");
  const correctId = local.result?.correctOptionId;
  const disagreeingFriend = showResults
    ? local.friends?.find((f) => f.optionId && f.optionId !== local.myOptionId)
    : undefined;
  const imageOptions = local.options.some((o) => Boolean(o.imageUrl));
  const crowded = Boolean(local.promptImageUrl) || imageOptions || local.options.length > 3;
  const prompt = displayCopy(local.prompt, language);
  const promptStyle = promptTextStyle(prompt, { crowded });
  // Never fall back to raw label — that reintroduces the other language's script.
  const optionLabel = (label: string | null | undefined) => displayCopy(label, language);
  // While picking, stay on the unanswered copy so status + scores flip together once.
  const status = momentStatus(
    {
      respondError,
      shareError,
      answered: showResults,
      isQuiz,
      gotItRight: Boolean(correctId) && local.myOptionId === correctId,
      correctKnown: Boolean(correctId),
      friend: disagreeingFriend
        ? {
            name: disagreeingFriend.displayName,
            choice:
              optionLabel(local.options.find((o) => o.id === disagreeingFriend.optionId)?.label) ||
              t("somethingElse"),
          }
        : null,
      myChoice: myOption ? optionLabel(myOption.label) || t("selected") : null,
    },
    {
      pickQuizAnswer: t("pickQuizAnswer"),
      pickPollAnswer: t("pickPollAnswer"),
      correctExclaim: t("correctExclaim"),
      notThisTime: t("notThisTime"),
      friendChose: t("friendChose"),
    },
  );

  function renderOption(o: FeedMoment["options"][number], tile: boolean) {
    const label = optionLabel(o.label);
    if (!showResults) {
      return (
        <AnswerButton
          key={o.id}
          label={label}
          imageUrl={o.imageUrl}
          tile={tile}
          compact={local.options.length > 4}
          selected={selectedId === o.id}
          showCheck={selectedId === o.id}
          disabled={picking}
          onPress={() => void pick(o.id)}
        />
      );
    }
    const count = crowd.optionCounts[o.id] ?? 0;
    const isCorrect = Boolean(correctId) && correctId === o.id;
    const isMine = local.myOptionId === o.id;
    const revealQuiz = isQuiz && Boolean(correctId);
    return (
      <AnswerButton
        key={o.id}
        label={label}
        imageUrl={o.imageUrl}
        tile={tile}
        compact={local.options.length > 4}
        percent={total > 0 ? Math.round((count / total) * 100) : 0}
        selected={isMine}
        correct={revealQuiz ? isCorrect : false}
        incorrect={revealQuiz && isMine && !isCorrect}
        disabled
        // Quiz: tick only the right answer. Poll: tick the option you picked.
        showCheck={revealQuiz ? isCorrect : isMine}
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
          <View style={[styles.hotTag, (isTriviaTag || isQuizTag) && styles.triviaTag]}>
            <Text style={[type.metadata, styles.hotTagText, { fontFamily: ui.bodyBold }]}>
              {isTriviaTag
                ? `🧠 ${t("triviaTag")}`
                : isQuizTag
                  ? `🧩 ${t("quizTag")}`
                  : tagSlug === "poll"
                    ? `📊 ${t("pollTag")}`
                    : `🔥 ${tagLabel}`}
            </Text>
          </View>
          <LivePill count={total} label={fill(t("playingNow"), { count: formatCount(total) })} />
        </View>

        <View style={[styles.card, !imageOptions && styles.cardCentered]}>
          {showResults ? <View style={styles.cardGlow} /> : null}
          <View style={styles.promptBlock}>
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
              minimumFontScale={0.9}
            >
              {prompt}
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
  triviaTag: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.lime },
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
  cardGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(255,77,141,0.12)",
  },
  // Prompt/status can yield space; answer rows keep a fixed readable size.
  promptBlock: { flexShrink: 1, minHeight: 0 },
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
  status: { minHeight: 44, justifyContent: "center", marginVertical: spacing.xs, flexShrink: 0 },
  statusText: { textAlign: "center" },
  grid: { flexGrow: 1, flexShrink: 1, minHeight: 0, gap: spacing.sm, justifyContent: "center" },
  gridRow: { flexDirection: "row", gap: spacing.sm, minHeight: 140, alignItems: "stretch" },
  gridSpacer: { flex: 1 },
  list: { flexGrow: 0, flexShrink: 0 },
});
