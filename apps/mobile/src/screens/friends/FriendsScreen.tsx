import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, FeedMoment, formatCount, isApiError, MeProfile } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { ErrorState } from "../../components/ErrorState";
import { PlayerIdCard } from "../../components/PlayerIdCard";
import { PrimaryButton } from "../../components/PrimaryButton";
import { isMoment, useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { extractPlayerId, shortPlayerId } from "../../lib/playerId";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onSignIn: () => void;
  onOpenLeaderboard?: () => void;
};

type Notice = { kind: "success" | "error"; text: string } | null;

const INVITE_MESSAGE = "Come play with me on PLAY — every swipe is a game.";

export function FriendsScreen({ onSignIn, onOpenLeaderboard }: Props) {
  const { isSignedIn, user } = useAuth();
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
  } = useApp();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addInput, setAddInput] = useState("");
  const [sending, setSending] = useState(false);

  const parsedId = extractPlayerId(addInput);
  const inputInvalid = addInput.trim().length > 0 && !parsedId;

  const friendLiveMoments = useMemo(
    () =>
      items
        .filter((i): i is FeedMoment => isMoment(i))
        .filter((m) => (m.friends?.length ?? 0) > 0)
        .slice(0, 8),
    [items],
  );

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<MeProfile>("/v1/me"));
    } catch {
      /* the ID card stays hidden until the profile loads */
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setMe(null);
      return;
    }
    void loadMe();
  }, [isSignedIn, user?.id, loadMe]);

  const reloadAll = useCallback(async () => {
    await Promise.allSettled([refreshFriends(true), refreshFriendRequests(true), loadMe()]);
  }, [refreshFriends, refreshFriendRequests, loadMe]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await reloadAll();
    } finally {
      setRefreshing(false);
    }
  }

  async function runAction(key: string, action: () => Promise<unknown>, success: string, fallback: string) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "success", text: success });
      await reloadAll();
    } catch (e) {
      setNotice({ kind: "error", text: isApiError(e) ? e.userMessage : fallback });
    } finally {
      setBusy(null);
    }
  }

  function acceptRequest(id: string, name: string) {
    void runAction(
      `accept:${id}`,
      () => api(`/v1/friends/requests/${id}/accept`, { method: "POST" }),
      `You're now friends with ${name}.`,
      "Could not accept the request.",
    );
  }

  function declineRequest(id: string, name: string) {
    void runAction(
      `decline:${id}`,
      () => api(`/v1/friends/requests/${id}`, { method: "DELETE" }),
      `Declined ${name}'s request.`,
      "Could not decline the request.",
    );
  }

  function cancelRequest(id: string, name: string) {
    void runAction(
      `cancel:${id}`,
      () => api(`/v1/friends/requests/${id}`, { method: "DELETE" }),
      `Cancelled your request to ${name}.`,
      "Could not cancel the request.",
    );
  }

  function confirmRemove(userId: string, name: string) {
    Alert.alert(`Remove ${name}?`, "They won't be notified. You can add them again with their player ID.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void runAction(
            `remove:${userId}`,
            () => api(`/v1/friends/${userId}`, { method: "DELETE" }),
            `Removed ${name} from your friends.`,
            "Could not remove this friend.",
          ),
      },
    ]);
  }

  async function pasteId() {
    const text = await Clipboard.getStringAsync();
    const id = extractPlayerId(text);
    if (id) {
      setAddInput(id);
      setNotice(null);
    } else {
      setNotice({ kind: "error", text: "There's no player ID on your clipboard." });
    }
  }

  async function sendRequest() {
    if (!parsedId) {
      setNotice({ kind: "error", text: "Enter a full player ID, like 3f2a9c1b-0d4e-4b7a-9c2d-81e5f6a7b8c9." });
      return;
    }
    if (parsedId === me?.id) {
      setNotice({ kind: "error", text: "That's your own player ID. Share it with friends instead." });
      return;
    }
    const friend = friends.find((f) => f.userId === parsedId);
    if (friend) {
      setNotice({ kind: "success", text: `You're already friends with ${friend.displayName}.` });
      return;
    }
    const sent = friendRequests.outgoing.find((r) => r.userId === parsedId);
    if (sent) {
      setNotice({ kind: "success", text: `You already sent ${sent.displayName} a request.` });
      return;
    }

    setSending(true);
    setNotice(null);
    try {
      const res = await api<{ id: string; status: string }>("/v1/friends/requests", {
        method: "POST",
        body: JSON.stringify({ userId: parsedId }),
      });
      setAddInput("");
      setNotice({
        kind: "success",
        text:
          res.status === "accepted"
            ? "You're now friends!"
            : "Request sent. They'll appear in your friends once they accept.",
      });
      await reloadAll();
    } catch (e) {
      setNotice({ kind: "error", text: isApiError(e) ? e.userMessage : "Could not send the request." });
    } finally {
      setSending(false);
    }
  }

  async function inviteFriends() {
    try {
      await Share.share({ message: me ? `${INVITE_MESSAGE}\nMy player ID: ${me.id}` : INVITE_MESSAGE });
    } catch {
      /* cancelled */
    }
  }

  if (!isSignedIn) {
    return (
      <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Friends</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>
          Play with people you know and see who's on the same moments as you.
        </Text>
        <View style={[styles.card, { marginTop: spacing.lg }]}>
          <View style={styles.signedOutIcon}>
            <Ionicons name="people" size={28} color={colors.pink} />
          </View>
          <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
            Sign in to get your player ID
          </Text>
          <Text style={[type.bodySm, { color: colors.lilac }]}>
            Your ID is how friends find you. Once you're signed in you can add friends and accept requests.
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

  const nothingLoaded = !friends.length && !friendRequests.incoming.length && !friendRequests.outgoing.length;

  if ((friendsLoading || friendRequestsLoading) && nothingLoaded && !me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.lime} size="large" />
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>Loading friends…</Text>
      </View>
    );
  }

  if (friendsError && nothingLoaded && !me) {
    return (
      <View style={styles.wrap}>
        <ErrorState message={friendsError} onRetry={() => void reloadAll()} />
      </View>
    );
  }

  const requestCount = friendRequests.incoming.length + friendRequests.outgoing.length;

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.lime} />
      }
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[type.screenTitle, { color: colors.paper }]}>Friends</Text>
          <Text style={[type.bodySm, { color: colors.lilac }]}>
            {friends.length
              ? `${friends.length} friend${friends.length === 1 ? "" : "s"} · see what they're playing`
              : "Add friends with their player ID"}
          </Text>
        </View>
        <IconButton icon="share-outline" label="Invite friends" onPress={() => void inviteFriends()} />
      </View>

      {notice ? (
        <View style={[styles.notice, notice.kind === "error" ? styles.noticeError : styles.noticeSuccess]}>
          <Ionicons
            name={notice.kind === "error" ? "alert-circle" : "checkmark-circle"}
            size={18}
            color={notice.kind === "error" ? colors.pink : colors.lime}
          />
          <Text style={[type.bodySm, { color: colors.paper, flex: 1 }]} accessibilityRole="alert">
            {notice.text}
          </Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={10} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={16} color={colors.lilac} />
          </Pressable>
        </View>
      ) : null}

      {me ? (
        <View style={styles.section}>
          <PlayerIdCard
            id={me.id}
            displayName={me.displayName}
            avatarKey={me.avatarKey}
            caption="Friends add you with this ID. Copy it or share it with them."
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title="Add a friend" />
        <View style={styles.card}>
          <Text style={[type.bodySm, { color: colors.lilac }]}>
            Ask your friend for their player ID (it's on their Friends tab and profile), then paste it here.
          </Text>
          <View
            style={[
              styles.inputRow,
              parsedId ? styles.inputValid : null,
              inputInvalid ? styles.inputInvalid : null,
            ]}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.lilac} />
            <TextInput
              value={addInput}
              onChangeText={(t) => {
                setAddInput(t);
                if (notice?.kind === "error") setNotice(null);
              }}
              placeholder="Player ID"
              placeholderTextColor={colors.lilac}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void sendRequest()}
              style={styles.input}
            />
            {addInput ? (
              <Pressable onPress={() => setAddInput("")} hitSlop={8} accessibilityLabel="Clear">
                <Ionicons name="close-circle" size={18} color={colors.lilac} />
              </Pressable>
            ) : (
              <Pressable onPress={() => void pasteId()} style={styles.pasteChip} accessibilityLabel="Paste player ID">
                <Ionicons name="clipboard-outline" size={14} color={colors.paper} />
                <Text style={styles.pasteText}>Paste</Text>
              </Pressable>
            )}
          </View>
          {parsedId ? (
            <Text style={[type.metadata, { color: colors.lime }]}>Player {shortPlayerId(parsedId)} · ready to send</Text>
          ) : inputInvalid ? (
            <Text style={[type.metadata, { color: colors.pink }]}>That doesn't look like a full player ID.</Text>
          ) : null}
          <PrimaryButton
            label={sending ? "Sending…" : "Send friend request"}
            icon="paper-plane-outline"
            onPress={() => void sendRequest()}
            disabled={sending || !parsedId}
          />
        </View>
      </View>

      {friendLiveMoments.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Live now" />
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

      {requestCount > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Requests" count={friendRequests.incoming.length || undefined} />
          <View style={styles.list}>
            {friendRequests.incoming.map((r, i) => (
              <PersonRow
                key={r.id}
                first={i === 0}
                name={r.displayName}
                avatarKey={r.avatarKey}
                subtitle={`${shortPlayerId(r.userId)} · wants to be friends`}
              >
                <IconButton
                  icon="close"
                  label={`Decline ${r.displayName}`}
                  onPress={() => declineRequest(r.id, r.displayName)}
                  disabled={busy !== null}
                />
                <IconButton
                  icon="checkmark"
                  label={`Accept ${r.displayName}`}
                  tone="lime"
                  busy={busy === `accept:${r.id}`}
                  onPress={() => acceptRequest(r.id, r.displayName)}
                  disabled={busy !== null}
                />
              </PersonRow>
            ))}
            {friendRequests.outgoing.map((r, i) => (
              <PersonRow
                key={r.id}
                first={i === 0 && !friendRequests.incoming.length}
                name={r.displayName}
                avatarKey={r.avatarKey}
                subtitle={`${shortPlayerId(r.userId)} · waiting for reply`}
              >
                <Pressable
                  onPress={() => cancelRequest(r.id, r.displayName)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  {busy === `cancel:${r.id}` ? (
                    <ActivityIndicator size="small" color={colors.lilac} />
                  ) : (
                    <Text style={[type.bodySm, { color: colors.lilac, fontFamily: fonts.bodyBold }]}>Cancel</Text>
                  )}
                </Pressable>
              </PersonRow>
            ))}
          </View>
        </View>
      ) : null}

      {friendRequestsError ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.md }]}>{friendRequestsError}</Text>
      ) : null}

      <View style={styles.section}>
        <SectionTitle
          title="Your friends"
          count={friends.length || undefined}
          action={onOpenLeaderboard ? { label: "Leaderboard", onPress: onOpenLeaderboard } : undefined}
        />
        {friendsError ? (
          <Text style={[type.bodySm, { color: colors.pink }]} accessibilityRole="alert">
            {friendsError}
          </Text>
        ) : null}
        {friends.length ? (
          <View style={styles.list}>
            {friends.map((f, i) => (
              <PersonRow
                key={f.userId}
                first={i === 0}
                name={f.displayName}
                avatarKey={f.avatarKey}
                subtitle={shortPlayerId(f.userId)}
              >
                <IconButton
                  icon="person-remove-outline"
                  label={`Remove ${f.displayName}`}
                  busy={busy === `remove:${f.userId}`}
                  onPress={() => confirmRemove(f.userId, f.displayName)}
                  disabled={busy !== null}
                />
              </PersonRow>
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.empty]}>
            <Ionicons name="people-outline" size={32} color={colors.lilac} />
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>No friends yet</Text>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
              Share your player ID or paste a friend's ID above to get started.
            </Text>
          </View>
        )}
      </View>

      <PrimaryButton
        label="Invite friends to PLAY"
        variant="secondary"
        onPress={() => void inviteFriends()}
        style={{ marginTop: spacing.xl }}
        trailingIcon="share-outline"
      />
    </ScrollView>
  );
}

function SectionTitle({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={[type.micro, styles.sectionLabel]}>{title.toUpperCase()}</Text>
        {count ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[type.bodySm, { color: colors.pinkSoft }]}>{action.label} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PersonRow({
  name,
  avatarKey,
  subtitle,
  first,
  children,
}: {
  name: string;
  avatarKey: string | null;
  subtitle: string;
  first: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.personRow, !first && styles.personDivider]}>
      <AvatarImage displayName={name} avatarKey={avatarKey} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.metadata, { color: colors.lilac, fontFamily: fonts.mono }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.rowActions}>{children}</View>
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  tone = "neutral",
  busy,
  disabled,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  tone?: "neutral" | "lime";
  busy?: boolean;
  disabled?: boolean;
}) {
  const fg = tone === "lime" ? colors.ink : colors.paper;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        tone === "lime" && styles.iconButtonLime,
        (pressed || (disabled && !busy)) && { opacity: 0.6 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={18} color={fg} />}
    </Pressable>
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md,
  },
  signedOutIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.pinkFill,
    alignItems: "center",
    justifyContent: "center",
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  noticeSuccess: { backgroundColor: colors.limeFill, borderColor: "rgba(198, 255, 61, 0.4)" },
  noticeError: { backgroundColor: colors.pinkFill, borderColor: colors.pinkGlow },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { color: colors.lilac, letterSpacing: 1.2, fontFamily: fonts.bodyBold },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.pink,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.paper },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  inputValid: { borderColor: colors.lime },
  inputInvalid: { borderColor: colors.pink },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: colors.paper,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  pasteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  pasteText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.paper },
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
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  personDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonLime: { backgroundColor: colors.lime, borderColor: colors.lime },
  textButton: { paddingHorizontal: 12, paddingVertical: 8, minWidth: 64, alignItems: "center" },
  empty: { alignItems: "center", paddingVertical: spacing.lg, gap: spacing.sm },
});
