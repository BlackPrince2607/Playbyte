import { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FeedMoment, formatCount } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { FeedTopBar } from "../../components/FeedTopBar";
import { FriendAvatars } from "../../components/FriendAvatars";
import { MajorityChip } from "../../components/StitchPrimitives";
import { isMoment, useApp } from "../../context/AppContext";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onProfile?: () => void;
};

export function LiveNowScreen({ onProfile }: Props) {
  const { items, jumpToMoment, feedLoading, feedError, refreshFeed, friendAvatars } = useApp();

  const moments = useMemo(() => {
    return items
      .filter((i): i is FeedMoment => isMoment(i))
      .filter((m) => m.status !== "closed")
      .sort((a, b) => (b.result?.totalResponses ?? 0) - (a.result?.totalResponses ?? 0));
  }, [items]);

  function friendsForMoment(m: FeedMoment) {
    if (m.friends?.length) {
      return m.friends.map((f) => ({ displayName: f.displayName, avatarKey: f.avatarKey }));
    }
    return friendAvatars.slice(0, 2);
  }

  if (feedLoading && !moments.length) {
    return (
      <View style={styles.wrap}>
        <FeedTopBar variant="compete" onProfile={onProfile} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.lime} size="large" />
          <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>Loading live moments…</Text>
        </View>
      </View>
    );
  }

  if (feedError && !moments.length) {
    return (
      <View style={styles.wrap}>
        <FeedTopBar variant="compete" onProfile={onProfile} />
        <ErrorState message={feedError} onRetry={() => void refreshFeed(true)} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <FeedTopBar variant="compete" onProfile={onProfile} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[type.hero, { color: colors.paper }]}>What India is playing.</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm, marginBottom: spacing.lg }]}>
          Jump into games already full of people.
        </Text>
        <View style={styles.grid}>
          {moments.map((m) => {
            const shownFriends = friendsForMoment(m);
            const total = m.result?.totalResponses ?? 0;
            const tag = m.tags?.[0];
            const counts = m.result?.optionCounts ?? {};
            let majorityLabel = "";
            let majorityPct = 0;
            if (total > 0 && m.options.length) {
              let topId = "";
              let topCount = -1;
              for (const o of m.options) {
                const c = counts[o.id] ?? 0;
                if (c > topCount) {
                  topCount = c;
                  topId = o.id;
                }
              }
              const top = m.options.find((o) => o.id === topId);
              if (top?.label && topCount > 0) {
                majorityLabel = top.label;
                majorityPct = Math.round((topCount / total) * 100);
              }
            }
            return (
              <Pressable key={m.id} style={styles.card} onPress={() => jumpToMoment(m.id)}>
                {m.promptImageUrl ? (
                  <Image source={{ uri: m.promptImageUrl }} style={styles.hero} resizeMode="cover" />
                ) : null}
                <View style={styles.cardTop}>
                  <Text style={[type.metadata, styles.badge, { fontFamily: fonts.bodyBold }]}>
                    {tag?.name?.toUpperCase() ?? m.category?.name?.toUpperCase() ?? "LIVE"}
                  </Text>
                  <View style={styles.countPill}>
                    <View style={styles.liveDot} />
                    <Text style={[type.statsSm, { color: colors.paper, fontSize: 12 }]}>{formatCount(total)}</Text>
                  </View>
                </View>
                <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 22 }]} numberOfLines={2}>
                  {m.prompt}
                </Text>
                {majorityLabel ? <MajorityChip label={majorityLabel} percent={majorityPct} /> : null}
                {shownFriends.length > 0 ? (
                  <FriendAvatars friends={shownFriends} compact />
                ) : null}
                {total > 0 ? (
                  <Text style={[type.bodySm, { color: colors.lilac }]}>{formatCount(total)} responses</Text>
                ) : null}
              </Pressable>
            );
          })}
          {moments.length === 0 ? (
            <EmptyState
              title="Nothing live right now"
              message="Check back soon — new moments drop throughout the day."
              actionLabel="Refresh"
              onAction={() => void refreshFeed(true)}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 120 },
  scroll: { paddingTop: 110, paddingHorizontal: spacing.margin, paddingBottom: 120 },
  grid: { gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
  },
  hero: { width: "100%", height: 120, borderRadius: radius.md, marginBottom: spacing.sm },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: {
    color: colors.lilac,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(198,255,61,0.12)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime },
});
