import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, isApiError } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  onSignIn: () => void;
};

export function FriendsScreen({ onSignIn }: Props) {
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
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [showAdd, setShowAdd] = useState(false);

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

  if (!isSignedIn) {
    return (
      <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Friends</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
          See who showed up — no public leaderboard, just belonging.
        </Text>
        <View style={styles.card}>
          <Text style={[type.bodyLg, { color: colors.paper }]}>
            Sign in to add friends and see who's playing with you.
          </Text>
          {isSupabaseConfigured() ? (
            <PrimaryButton label="Sign in" onPress={onSignIn} />
          ) : (
            <Text style={[type.bodySm, { color: colors.lilac }]}>
              Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
            </Text>
          )}
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.lime} />}
    >
      <Text style={[type.screenTitle, { color: colors.paper }]}>Friends</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
        See who showed up — no public leaderboard, just belonging.
      </Text>

      {actionSuccess ? (
        <Text style={[type.bodySm, { color: colors.lime, marginTop: spacing.sm }]}>{actionSuccess}</Text>
      ) : null}
      {actionError ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.sm }]} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}

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
            <PrimaryButton label={adding ? "Sending…" : "Send request"} onPress={() => void sendRequest()} disabled={adding} />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { padding: spacing.margin, paddingTop: 60, paddingBottom: 100 },
  center: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", paddingTop: 80 },
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
