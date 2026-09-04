import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api, FeedMoment, formatCount, isShareCancelled, shareErrorMessage, ShareCardResponse } from "../../api";
import { ActionRail } from "../../components/ActionRail";
import { AnswerButton } from "../../components/AnswerButton";
import { FriendAvatars } from "../../components/FriendAvatars";
import { LivePill } from "../../components/PlayLogo";
import { useApp } from "../../context/AppContext";
import { useMountedRef } from "../../lib/useMounted";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

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
        const snap = await api<{ totalResponses: number; optionCounts: Record<string, number> }>(
          `/v1/moments/${item.id}/result`,
        );
        if (!mounted.current || cancelled) return;
        setLocal((prev) => ({
          ...prev,
          result: {
            totalResponses: snap.totalResponses,
            optionCounts: snap.optionCounts,
            volumeState: prev.result?.volumeState,
            joinedLastMinute: prev.result?.joinedLastMinute,
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
      setLocal((prev) => ({ ...prev, myOptionId: optionId }));
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

  return (
    <View style={[styles.page, { height }]}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink, opacity: 0.7 }]} />
        <LinearGradient colors={["transparent", "rgba(21,14,43,0.8)", colors.ink]} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.tag}>
            <Text style={[type.metadata, styles.tagText]}>{local.category?.name?.toUpperCase() ?? "LIVE"}</Text>
          </View>
          <LivePill
            count={total}
            label={volume === "nascent" ? "Be the first 50" : `${formatCount(total)} playing now`}
          />
        </View>

        <Text style={[type.gameQuestion, styles.prompt]}>{local.prompt}</Text>

        {submitting ? (
          <ActivityIndicator color={colors.lime} style={{ marginVertical: spacing.sm }} accessibilityLabel="Submitting" />
        ) : null}

        {respondError ? (
          <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]} accessibilityRole="alert">
            {respondError}
          </Text>
        ) : null}

        {shareError ? (
          <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]} accessibilityRole="alert">
            {shareError}
          </Text>
        ) : null}

        <View style={styles.options}>
          {local.options.map((o) => {
            const count = local.result?.optionCounts?.[o.id] ?? 0;
            const pct = answered && total > 0 ? Math.round((count / total) * 100) : null;
            return (
              <AnswerButton
                key={o.id}
                label={o.label}
                percent={pct}
                selected={local.myOptionId === o.id}
                disabled={answered || submitting}
                onPress={() => void pick(o.id)}
              />
            );
          })}
        </View>

        {friends.length > 0 ? (
          <FriendAvatars
            friends={friends}
            extraCount={Math.max(0, total - friends.length)}
          />
        ) : null}

        <ActionRail
          responses={total}
          onShare={() => void handleShare()}
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
    justifyContent: "flex-end",
  },
  content: { flex: 1, justifyContent: "flex-end", gap: spacing.md },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  tag: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: colors.lilac, letterSpacing: 1 },
  prompt: { color: colors.paper, textAlign: "center", marginVertical: spacing.lg },
  options: { width: "100%" },
  swipeHint: { color: colors.lilac, textAlign: "center", marginTop: spacing.sm },
});
