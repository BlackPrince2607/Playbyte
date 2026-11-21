import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FeedGame, OnlineMatch } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { CloseButton } from "../../components/CloseButton";
import { useApp } from "../../context/AppContext";
import { useLanguage } from "../../context/LanguageContext";
import { fill } from "../../i18n/strings";
import { resolveFeedGame } from "../../lib/gameCatalog";
import { listMyMatches } from "../../lib/matchmaking";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onClose: () => void;
  onPlayMatch?: (
    game: FeedGame,
    match: {
      id: string;
      seed: string;
      opponent?: { displayName: string; avatarKey: string | null };
    },
  ) => void;
  onProfile?: () => void;
};

export function BattleHistoryScreen({ onClose, onPlayMatch, onProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { items } = useApp();
  const [matches, setMatches] = useState<OnlineMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const feed = items.filter((i): i is FeedGame => i.type === "mini_game");

  const load = useCallback(async () => {
    try {
      setMatches(await listMyMatches());
    } catch {
      /* keep prior */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} color={colors.paper} style={styles.close} />
        <Text style={[type.bodyLg, styles.headerTitle]} numberOfLines={1}>
          {t("battleHistoryTitle")}
        </Text>
        <Pressable accessibilityRole="button" onPress={onProfile} style={styles.avatarBtn}>
          <Ionicons name="person" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.lime} />
        }
      >
        {loading && matches.length === 0 ? (
          <ActivityIndicator color={colors.lime} style={{ marginTop: spacing.xl }} />
        ) : matches.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={28} color={colors.lilac} />
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
              {t("noBattleHistory")}
            </Text>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
              {t("noOnlineMatches")}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {matches.map((m, i) => {
              const name = m.opponent?.displayName ?? t("opponent");
              const canPlay =
                (m.status === "ready" || m.status === "playing") && !m.iHavePlayed && Boolean(onPlayMatch);
              const subtitle =
                m.status === "completed"
                  ? fill(t("challengeCompleted"), {
                      my: m.myScore ?? "—",
                      their: m.theirScore ?? "—",
                      name,
                    })
                  : m.iHavePlayed
                    ? fill(t("waitingForOpponent"), { name })
                    : fill(t("matchFoundVs"), { name });
              return (
                <View key={m.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <AvatarImage displayName={name} avatarKey={m.opponent?.avatarKey ?? null} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]} numberOfLines={1}>
                      {m.gameTitle}
                    </Text>
                    <Text style={[type.metadata, { color: colors.lilac }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  </View>
                  {canPlay ? (
                    <Pressable
                      onPress={() => {
                        void resolveFeedGame(m.gameKey, {
                          title: m.gameTitle,
                          feed,
                          hint: {
                            title: m.gameTitle,
                            blurb: m.gameBlurb,
                            engine: m.engine,
                            variation: m.variation,
                            config: m.config,
                          },
                        }).then((game) =>
                          onPlayMatch?.(game, {
                            id: m.id,
                            seed: m.seed,
                            opponent: m.opponent
                              ? {
                                  displayName: m.opponent.displayName,
                                  avatarKey: m.opponent.avatarKey ?? null,
                                }
                              : undefined,
                          }),
                        );
                      }}
                      style={({ pressed }) => [styles.playChip, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityLabel={t("playChallenge")}
                    >
                      <Text style={styles.playChipText}>{t("playChallenge")}</Text>
                    </Pressable>
                  ) : m.status === "completed" ? (
                    <Text style={[type.micro, { color: colors.lilac }]}>{t("seeChallengeResult")}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    height: 64,
    paddingHorizontal: spacing.margin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.paper,
    fontFamily: fonts.display,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.xl,
  },
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  playChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
  },
  playChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.paper },
  empty: {
    marginTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
