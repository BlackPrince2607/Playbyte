import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  api,
  isApiError,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { BackLink } from "../../components/BackLink";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { GuestGate } from "../../components/GuestGate";
import { MajaLogo } from "../../components/MajaLogo";
import { ScreenLoading } from "../../components/ScreenLoading";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onBack: () => void;
  onSignIn?: () => void;
};

const SCOPES: { id: LeaderboardScope; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "global", label: "Global" },
];

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[type.metadata, { color: on ? colors.paper : colors.lilac, fontFamily: on ? fonts.bodyBold : fonts.body }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View style={[styles.row, entry.isYou && styles.youRow]}>
      <Text style={[type.statsSm, styles.rank, { color: entry.isYou ? colors.paper : colors.lilac }]}>
        {entry.rank ? `#${entry.rank}` : "—"}
      </Text>
      <AvatarImage displayName={entry.displayName} avatarKey={entry.avatarKey} size={40} />
      <Text style={[type.bodyLg, styles.name]} numberOfLines={1}>
        {entry.isYou ? "You" : entry.displayName}
      </Text>
      <Text style={[type.statsSm, { color: entry.isYou ? colors.paper : colors.lime }]}>{entry.points} pts</Text>
    </View>
  );
}

/** Weekly and all-time ranks from real answers and finished games. */
export function LeaderboardScreen({ onBack, onSignIn }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isSignedIn } = useAuth();
  const [scope, setScope] = useState<LeaderboardScope>(isSignedIn ? "friends" : "global");
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  const needsSignIn = scope === "friends" && !isSignedIn;

  const load = useCallback(
    async (pull = false) => {
      const id = ++request.current;
      setError("");
      if (needsSignIn) {
        setBoard(null);
        return;
      }
      if (pull) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api<Leaderboard>(`/v1/leaderboards/${scope}?period=${period}`);
        if (id === request.current) setBoard(res);
      } catch (e) {
        if (id === request.current) {
          setBoard(null);
          setError(isApiError(e) ? e.userMessage : "Could not load the leaderboard.");
        }
      } finally {
        if (id === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [scope, period, needsSignIn],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const you = board?.you ?? null;
  const youListed = Boolean(board?.entries.some((e) => e.isYou));
  const perAction = board?.pointsPerAction ?? 10;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <BackLink onPress={onBack} withLabel={false} />
        <MajaLogo />
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.lime} />
        }
      >
        <Text style={[type.screenTitle, { color: colors.paper, marginTop: spacing.md }]}>Who’s winning?</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.xs }]}>
          {perAction} points for every moment you answer and every game you finish.
        </Text>

        <View style={styles.chips} accessibilityRole="tablist">
          {SCOPES.map((s) => (
            <Chip key={s.id} label={s.label} on={scope === s.id} onPress={() => setScope(s.id)} />
          ))}
          <View style={styles.divider} />
          {PERIODS.map((p) => (
            <Chip key={p.id} label={p.label} on={period === p.id} onPress={() => setPeriod(p.id)} />
          ))}
        </View>

        {needsSignIn ? (
          <View style={styles.card}>
            <GuestGate title={t("signInToCompete")} actionLabel={t("signIn")} onSignIn={onSignIn} />
          </View>
        ) : loading && !board ? (
          <ScreenLoading label={t("loadingLeaderboard")} style={{ flex: 0, minHeight: 160 }} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} compact />
        ) : board ? (
          <>
            {you ? (
              <View style={styles.positionCard}>
                <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 2 }]}>YOUR RANK</Text>
                <Text style={[type.largeScore, { color: colors.pinkSoft, fontSize: 56, marginVertical: 8 }]}>
                  {you.rank ? `#${you.rank}` : "—"}
                </Text>
                <Text style={[type.bodySm, { color: colors.paper }]}>
                  {you.hidden
                    ? "Your profile is private, so you’re hidden from the global board."
                    : you.points > 0
                      ? `${you.points} points ${period === "week" ? "this week" : "so far"}`
                      : "Answer a moment or finish a game to get on the board."}
                </Text>
              </View>
            ) : null}

            {board.entries.length === 0 ? (
              <EmptyState
                title={scope === "friends" ? "No friends on the board" : "Empty board"}
                message={
                  scope === "friends"
                    ? "Add friends from the Friends tab and they’ll show up here."
                    : "No one has scored yet. Be the first!"
                }
                style={{ flex: 0, paddingTop: spacing.lg }}
              />
            ) : (
              <View style={styles.list}>
                {board.entries.map((e) => (
                  <Row key={e.userId} entry={e} />
                ))}
                {you && !youListed && !you.hidden ? <Row entry={you} /> : null}
              </View>
            )}

            {scope === "friends" && board.entries.length === 1 ? (
              <Text style={[type.bodySm, styles.empty]}>Add friends from the Friends tab to fill your board.</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.margin },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardAlt,
  },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  divider: { width: 1, height: 20, backgroundColor: colors.line },
  positionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md,
  },
  empty: { color: colors.lilac, textAlign: "center", marginTop: spacing.lg },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  youRow: { backgroundColor: colors.pink, borderColor: colors.pinkSoft, borderWidth: 2 },
  rank: { width: 40, textAlign: "right" },
  name: { color: colors.paper, fontFamily: fonts.bodyBold, flex: 1 },
});
