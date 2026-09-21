import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, FeedMoment, formatCount, isApiError } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { isMoment, useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onSignIn: () => void;
  onOpenLeaderboard?: () => void;
};

export function FriendsScreen({ onSignIn, onOpenLeaderboard }: Props) {
  const { isSignedIn } = useAuth();
  const {
    friends,
    friendsLoading,
    friendsError,
    refreshFriends,
    friendRequests,
    friendRequestsLoading,
    friendRequestsError,
    refreshFriendRequests,
    items,
    jumpToMoment,
    streak,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const friendLiveMoments = useMemo(() => {
    return items
      .filter((i): i is FeedMoment => isMoment(i))
      .filter((m) => (m.friends?.length ?? 0) > 0)
      .slice(0, 8);
  }, [items]);

  /** Friends list only — competitive scores are deferred (no fabricated ranks). */
  const friendPreview = useMemo(
    () => friends.map((f, i) => ({ ...f, rank: i + 1 })),
    [friends],
  );

  const reloadAll = useCallback(async () => {
    setActionError("");
    await Promise.allSettled([refreshFriends(true), refreshFriendRequests(true)]);
  }, [refreshFriends, refreshFriendRequests]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await reloadAll();
    } finally {
      setRefreshing(false);
    }
  }

  async function acceptRequest(requestId: string) {
    setAcceptingId(requestId);
    setActionError("");
    setActionSuccess("");
    try {
      await api(`/v1/friends/requests/${requestId}/accept`, { method: "POST" });
      setActionSuccess("Friend request accepted.");
      await reloadAll();
    } catch (e) {
      setActionError(isApiError(e) ? e.userMessage : "Could not accept request.");
    } finally {
      setAcceptingId(null);
    }
  }

  async function sendRequest() {
    const userId = addUserId.trim();
    if (!userId) {
      setActionError("Enter a user ID.");
      return;
    }
    setAdding(true);
    setActionError("");
    setActionSuccess("");
    try {
      await api("/v1/friends/requests", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setActionSuccess("Friend request sent.");
      setAddUserId("");
      setShowAdd(false);
      await reloadAll();
    } catch (e) {
      setActionError(isApiError(e) ? e.userMessage : "Could not send request.");
    } finally {
      setAdding(false);
    }
  }

  async function inviteFriends() {
    try {
      await Share.share({
        message: "Come play with me on PLAY — every swipe is a game.",
      });
    } catch {
      /* cancelled */
    }
  }

  if (!isSignedIn) {
    return (
      <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Friends</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>
          Your friends are playing. Sign in to see what they’re on and beat their scores.
        </Text>
        <View style={styles.card}>
          <Text style={[type.bodyLg, { color: colors.paper }]}>
            Sign in to add friends and see who's playing with you.
          </Text>
          {isSupabaseConfigured() ? <PrimaryButton label="Sign in" onPress={onSignIn} /> : null}
          {onOpenLeaderboard ? (
            <PrimaryButton label="View leaderboard" variant="secondary" onPress={onOpenLeaderboard} />
          ) : null}
          <PrimaryButton label="Invite friends" variant="secondary" onPress={() => void inviteFriends()} />
        </View>
      </ScrollView>
    );
  }

  const initialLoading =
    (friendsLoading || friendRequestsLoading) &&
    !friends.length &&
    !friendRequests.incoming.length &&
    !friendRequests.outgoing.length;

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.lime} size="large" />
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>Loading friends…</Text>
      </View>
    );
  }

  if (
    friendsError &&
    !friends.length &&
    !friendRequests.incoming.length &&
    !friendRequests.outgoing.length
  ) {
    return (
      <View style={styles.wrap}>
        <ErrorState message={friendsError} onRetry={() => void reloadAll()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.inner}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.lime} />
      }
    >
      <Text style={[type.screenTitle, { color: colors.paper }]}>Your friends are playing.</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
        See what your friends are playing and beat their scores.
      </Text>

      {actionSuccess ? (
        <Text style={[type.bodySm, { color: colors.lime, marginTop: spacing.sm }]}>{actionSuccess}</Text>
      ) : null}
      {actionError ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.sm }]} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}

      {friendLiveMoments.length > 0 ? (
        <View style={styles.section}>
          <Text style={[type.metadata, styles.sectionLabel]}>LIVE NOW</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRow}>
            {friendLiveMoments.map((m) => {
              const friendName = m.friends?.[0]?.displayName ?? "Friend";
              const total = m.result?.totalResponses ?? 0;
              return (
                <Pressable key={m.id} style={styles.liveCard} onPress={() => jumpToMoment(m.id)}>
                  <View style={styles.liveTop}>
                    <View style={styles.liveDot} />
                    <Text style={[type.micro, { color: colors.lime, fontFamily: fonts.bodyBold }]}>PLAYING</Text>
                  </View>
                  <Text style={[type.bodySm, { color: colors.paper, fontFamily: fonts.bodyBold }]} numberOfLines={1}>
                    {friendName}
                  </Text>
                  <Text style={[type.metadata, { color: colors.lilac }]} numberOfLines={2}>
                    {m.prompt}
                  </Text>
                  <Text style={[type.statsSm, { color: colors.pink, fontSize: 12, marginTop: 6 }]}>
                    {formatCount(total)} in
                  </Text>
                  <PrimaryButton
                    label="Join"
                    onPress={() => jumpToMoment(m.id)}
                    style={{ marginTop: 8, paddingVertical: 8 }}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[type.metadata, styles.sectionLabel]}>FRIENDS</Text>
          {onOpenLeaderboard ? (
            <Pressable onPress={onOpenLeaderboard}>
              <Text style={[type.bodySm, { color: colors.pinkSoft }]}>Board ›</Text>
            </Pressable>
          ) : null}
        </View>
        {friendPreview.slice(0, 5).map((r) => (
          <View key={r.userId} style={styles.rankRow}>
            <Text style={[type.statsSm, { color: colors.lilac, width: 32 }]}>#{r.rank}</Text>
            <AvatarImage displayName={r.displayName} avatarKey={r.avatarKey} size={36} />
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold, flex: 1 }]}>
              {r.displayName}
            </Text>
            <Text style={[type.micro, { color: colors.lilac }]}>Friend</Text>
          </View>
        ))}
        {!friendPreview.length ? (
          <Text style={[type.bodySm, { color: colors.lilac }]}>Add friends to see them here. Streak: {streak}</Text>
        ) : null}
      </View>

      {friendRequests.incoming.length > 0 ? (
        <View style={styles.section}>
          <Text style={[type.metadata, styles.sectionLabel]}>INCOMING REQUESTS</Text>
          {friendRequests.incoming.map((r) => (
            <View key={r.id} style={styles.row}>
              <AvatarImage displayName={r.displayName} avatarKey={r.avatarKey} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyLg, { color: colors.paper, fontWeight: "700" }]}>{r.displayName}</Text>
                <Text style={[type.metadata, { color: colors.lilac }]}>Wants to connect</Text>
              </View>
              <PrimaryButton
                label={acceptingId === r.id ? "…" : "Accept"}
                onPress={() => void acceptRequest(r.id)}
                disabled={acceptingId === r.id}
                style={{ paddingVertical: 10, paddingHorizontal: 16 }}
              />
            </View>
          ))}
        </View>
      ) : null}

      {friendRequestsError ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.md }]}>{friendRequestsError}</Text>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[type.metadata, styles.sectionLabel]}>YOUR FRIENDS</Text>
          <Pressable onPress={() => setShowAdd((v) => !v)}>
            <Text style={[type.bodySm, { color: colors.pinkSoft }]}>{showAdd ? "Cancel" : "+ Add friend"}</Text>
          </Pressable>
        </View>

        {showAdd ? (
          <View style={styles.addCard}>
            <Text style={[type.bodySm, { color: colors.lilac }]}>Enter their user ID</Text>
            <TextInput
              value={addUserId}
              onChangeText={setAddUserId}
              placeholder="User ID (UUID)"
              placeholderTextColor={colors.lilac}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <PrimaryButton
              label={adding ? "Sending…" : "Send request"}
              onPress={() => void sendRequest()}
              disabled={adding}
            />
          </View>
        ) : null}

        {friendsError ? (
          <Text style={[type.bodySm, { color: colors.pink }]} accessibilityRole="alert">
            {friendsError}
          </Text>
        ) : null}

        {friends.map((f) => (
          <View key={f.userId} style={styles.row}>
            <AvatarImage displayName={f.displayName} avatarKey={f.avatarKey} size={44} />
            <View>
              <Text style={[type.bodyLg, { color: colors.paper, fontWeight: "700" }]}>{f.displayName}</Text>
              <Text style={[type.metadata, { color: colors.lilac }]}>{f.status}</Text>
            </View>
          </View>
        ))}

        {!friends.length && !showAdd ? (
          <EmptyState
            title="No friends yet"
            message="Play a few moments and invite people."
            actionLabel="Add friend"
            onAction={() => setShowAdd(true)}
          />
        ) : null}
      </View>

      {friendRequests.outgoing.length > 0 ? (
        <View style={styles.section}>
          <Text style={[type.metadata, styles.sectionLabel]}>OUTGOING REQUESTS</Text>
          {friendRequests.outgoing.map((r) => (
            <View key={r.id} style={styles.row}>
              <AvatarImage displayName={r.displayName} avatarKey={r.avatarKey} size={44} />
              <View>
                <Text style={[type.bodyLg, { color: colors.paper, fontWeight: "700" }]}>{r.displayName}</Text>
                <Text style={[type.metadata, { color: colors.lilac }]}>Pending</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <PrimaryButton
        label="Invite friends"
        onPress={() => void inviteFriends()}
        style={{ marginTop: spacing.xl }}
        trailingIcon="share-outline"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { padding: spacing.margin, paddingTop: 60, paddingBottom: 100 },
  center: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { color: colors.lilac, letterSpacing: 1 },
  liveRow: { gap: spacing.sm, paddingRight: spacing.margin },
  liveCard: {
    width: 180,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  liveTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  addCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    color: colors.paper,
  },
});
