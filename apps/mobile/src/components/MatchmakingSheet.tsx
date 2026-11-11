import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OnlineMatch } from "../api";
import { isApiError } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { fill } from "../i18n/strings";
import {
  cancelMatchmakingTicket,
  enqueueMatchmaking,
  getMatch,
  getMatchmakingTicket,
  matchmakingHeartbeat,
} from "../lib/matchmaking";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { PrimaryButton } from "./PrimaryButton";

type Props = {
  visible: boolean;
  gameKey: string;
  gameTitle: string;
  onClose: () => void;
  onMatched: (match: OnlineMatch) => void;
  onNeedSignIn: () => void;
  signedIn: boolean;
};

type Phase = "searching" | "countdown" | "failed";

export function MatchmakingSheet({
  visible,
  gameKey,
  gameTitle,
  onClose,
  onMatched,
  onNeedSignIn,
  signedIn,
}: Props) {
  const { t, fonts: ui } = useLanguage();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("searching");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [opponentName, setOpponentName] = useState("");
  const ticketId = useRef<string | null>(null);
  const matchRef = useRef<OnlineMatch | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!visible) {
      started.current = false;
      ticketId.current = null;
      matchRef.current = null;
      setPhase("searching");
      setError("");
      setCountdown(0);
      return;
    }
    if (!signedIn) {
      onNeedSignIn();
      onClose();
      return;
    }
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    async function begin() {
      try {
        const ticket = await enqueueMatchmaking({ gameKey });
        if (cancelled) return;
        ticketId.current = ticket.id;
        if (ticket.match) {
          await enterMatch(ticket.match);
          return;
        }
        pollTimer = setInterval(() => {
          void poll();
        }, 1200);
        heartbeatTimer = setInterval(() => {
          if (ticketId.current) void matchmakingHeartbeat(ticketId.current).catch(() => {});
        }, 5000);
      } catch (e) {
        if (cancelled) return;
        setPhase("failed");
        setError(isApiError(e) ? e.userMessage : t("matchSearchFailed"));
      }
    }

    async function poll() {
      if (!ticketId.current) return;
      try {
        const ticket = await getMatchmakingTicket(ticketId.current);
        if (ticket.match) {
          await enterMatch(ticket.match);
          return;
        }
        if (ticket.status === "expired" || ticket.status === "cancelled") {
          setPhase("failed");
          setError(t("noOpponent"));
          cleanup();
        }
      } catch {
        /* keep polling */
      }
    }

    async function enterMatch(match: OnlineMatch) {
      cleanup();
      matchRef.current = match;
      setOpponentName(match.opponent?.displayName ?? t("opponent"));
      const secs = match.countdownSeconds ?? 0;
      if (secs > 0) {
        setPhase("countdown");
        setCountdown(secs);
        const end = Date.now() + secs * 1000;
        const tick = setInterval(() => {
          const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
          setCountdown(left);
          if (left <= 0) {
            clearInterval(tick);
            void finishCountdown(match.id);
          }
        }, 250);
      } else {
        onMatched(match);
        onClose();
      }
    }

    async function finishCountdown(matchId: string) {
      try {
        const fresh = await getMatch(matchId);
        onMatched(fresh);
      } catch {
        if (matchRef.current) onMatched(matchRef.current);
      }
      onClose();
    }

    function cleanup() {
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }

    void begin();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [visible, signedIn, gameKey, onClose, onMatched, onNeedSignIn, t]);

  async function onCancel() {
    if (ticketId.current && phase === "searching") {
      try {
        await cancelMatchmakingTicket(ticketId.current);
      } catch {
        /* ignore */
      }
    }
    onClose();
  }

  async function onExtend() {
    try {
      const ticket = await enqueueMatchmaking({ gameKey, extend: true });
      ticketId.current = ticket.id;
      setPhase("searching");
      setError("");
      if (ticket.match) {
        setOpponentName(ticket.match.opponent?.displayName ?? t("opponent"));
        setPhase("countdown");
        setCountdown(ticket.match.countdownSeconds ?? 0);
        matchRef.current = ticket.match;
      }
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : t("matchSearchFailed"));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void onCancel()}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.card}>
          <Text style={[type.metadata, styles.eyebrow, { fontFamily: ui.bodyBold }]}>
            {t("playOnline").toUpperCase()}
          </Text>
          <Text style={[type.bodyLg, styles.title, { fontFamily: ui.display, color: colors.paper }]}>
            {gameTitle}
          </Text>
          {phase === "searching" ? (
            <>
              <ActivityIndicator color={colors.lime} size="large" style={{ marginVertical: spacing.lg }} />
              <Text style={[type.bodyLg, { color: colors.lilac, textAlign: "center", fontFamily: ui.body }]}>
                {t("searchingOpponent")}
              </Text>
              <PrimaryButton label={t("cancelSearch")} variant="secondary" onPress={() => void onCancel()} />
            </>
          ) : null}
          {phase === "countdown" ? (
            <>
              <Text style={[type.bodyLg, { color: colors.lime, textAlign: "center", fontFamily: ui.bodyBold }]}>
                {fill(t("matchFoundVs"), { name: opponentName })}
              </Text>
              <Text style={[type.largeScore, { color: colors.paper, marginVertical: spacing.md }]}>{countdown}</Text>
              <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: ui.body }]}>
                {t("getReady")}
              </Text>
            </>
          ) : null}
          {phase === "failed" ? (
            <>
              <Text style={[type.bodyLg, { color: colors.paper, textAlign: "center", fontFamily: ui.body, marginVertical: spacing.md }]}>
                {error || t("noOpponent")}
              </Text>
              <PrimaryButton label={t("tryAgain")} onPress={() => void onExtend()} />
              <PrimaryButton label={t("close")} variant="secondary" onPress={() => void onCancel()} />
            </>
          ) : null}
          {phase === "searching" ? (
            <Pressable onPress={() => void onExtend()} style={{ marginTop: spacing.sm }}>
              <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>{t("keepSearching")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12,8,24,0.82)",
    justifyContent: "center",
    paddingHorizontal: spacing.margin,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  eyebrow: { color: colors.lilac, letterSpacing: 2 },
  title: { textAlign: "center" },
});
