import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, FeedMoment, formatCount, isApiError, MeProfile } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { ErrorState } from "../../components/ErrorState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenLoading } from "../../components/ScreenLoading";
import { isMoment, useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { formatFriendCode, friendCodeFor, parseFriendCode } from "../../lib/friendCode";
import { withSeededCrowd } from "../../lib/seededEngagement";
import { shareAppInvite } from "../../lib/shareInvite";
import { useLanguage } from "../../context/LanguageContext";
import { fill } from "../../i18n/strings";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onSignIn: () => void;
  onOpenLeaderboard?: () => void;
};

type Notice = { kind: "success" | "error"; text: string } | null;

export function FriendsScreen({ onSignIn, onOpenLeaderboard }: Props) {
  const { t, fonts: ui } = useLanguage();
  const insets = useSafeAreaInsets();
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

  const parsedCode = parseFriendCode(addInput);
  const inputInvalid = addInput.trim().length >= 8 && !parsedCode;
  const myCode = me ? friendCodeFor(me.id) : null;
  const topPad = { paddingTop: insets.top + spacing.md };

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
      /* the ID row stays hidden until the profile loads */
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
    Alert.alert(`Remove ${name}?`, "They won't be notified. You can add them again with their friend code.", [
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

  async function pasteCode() {
    const code = parseFriendCode(await Clipboard.getStringAsync());
    if (code) {
      setAddInput(formatFriendCode(code));
      setNotice(null);
    } else {
      setNotice({ kind: "error", text: "There's no friend code on your clipboard." });
    }
  }

  async function addFriend() {
    if (!parsedCode) {
      setNotice({ kind: "error", text: "Enter your friend's 8-character code, like 7WN9-R6RD." });
      return;
    }
    if (parsedCode === myCode) {
      setNotice({ kind: "error", text: "That's your own friend code. Share it with friends instead." });
      return;
    }
    const friend = friends.find((f) => friendCodeFor(f.userId) === parsedCode);
    if (friend) {
      setNotice({ kind: "success", text: `You're already friends with ${friend.displayName}.` });
      return;
    }

    setSending(true);
    setNotice(null);
    try {
      const res = await api<{ status: "added" | "already"; friend: { displayName: string } }>("/v1/friends/add", {
        method: "POST",
        body: JSON.stringify({ code: parsedCode }),
      });
      setAddInput("");
      setNotice({
        kind: "success",
        text:
          res.status === "already"
            ? `You're already friends with ${res.friend.displayName}.`
            : `You're now friends with ${res.friend.displayName}!`,
      });
      await reloadAll();
    } catch (e) {
      setNotice({ kind: "error", text: isApiError(e) ? e.userMessage : t("couldNotAddFriend") });
    } finally {
      setSending(false);
    }
  }

  async function inviteFriends() {
    await shareAppInvite(me?.id, "friends");
  }

  if (!isSignedIn) {
    return (
      <ScrollView style={styles.wrap} contentContainerStyle={[styles.inner, topPad]}>
        <Header subtitle={t("playWithPeople")} onInvite={() => void inviteFriends()} />
        <View style={[styles.card, styles.hero]}>
          <View style={styles.heroIcon}>
            <Ionicons name="people" size={30} color={colors.pink} />
          </View>
          <Text style={[type.bodyLg, styles.heroTitle, { fontFamily: ui.bodyBold }]}>{t("signInToAdd")}</Text>
          <Text style={[type.bodySm, styles.heroBody, { fontFamily: ui.body }]}>
            {t("signInFriendsBody")}
          </Text>
          <View style={styles.heroActions}>
            {isSupabaseConfigured() ? <PrimaryButton label={t("signIn")} onPress={onSignIn} /> : null}
            {onOpenLeaderboard ? (
              <PrimaryButton label={t("viewLeaderboard")} variant="secondary" icon="trophy-outline" onPress={onOpenLeaderboard} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  const nothingLoaded = !friends.length && !friendRequests.incoming.length && !friendRequests.outgoing.length;

  if ((friendsLoading || friendRequestsLoading) && nothingLoaded && !me) {
    return <ScreenLoading label={t("loadingFriends")} style={styles.center} />;
  }

  if (friendsError && nothingLoaded && !me) {
    return (
      <View style={styles.wrap}>
        <ErrorState message={friendsError} onRetry={() => void reloadAll()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[styles.inner, topPad]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.lime} />
      }
    >
      <Header
        subtitle={
          friends.length
            ? fill(t(friends.length === 1 ? "friendCount" : "friendsCount"), { count: friends.length })
            : t("addWithCode")
        }
        onInvite={() => void inviteFriends()}
        onLeaderboard={onOpenLeaderboard}
      />

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

      <View style={styles.section}>
        <View style={styles.card}>
          {me ? <MyCodeRow playerId={me.id} /> : null}
          <View style={styles.addRow}>
            <View
              style={[styles.inputRow, parsedCode ? styles.inputValid : null, inputInvalid ? styles.inputInvalid : null]}
            >
              <TextInput
                value={addInput}
                onChangeText={(t) => {
                  setAddInput(t);
                  if (notice?.kind === "error") setNotice(null);
                }}
                placeholder="Friend's code"
                placeholderTextColor={colors.lilac}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => void addFriend()}
                style={styles.input}
                accessibilityLabel="Friend's code"
              />
              {addInput ? (
                <Pressable onPress={() => setAddInput("")} hitSlop={8} accessibilityLabel="Clear">
                  <Ionicons name="close-circle" size={18} color={colors.lilac} />
                </Pressable>
              ) : (
                <Pressable onPress={() => void pasteCode()} style={styles.pasteChip} accessibilityLabel="Paste friend code">
                  <Text style={[styles.pasteText, { fontFamily: ui.bodyBold }]}>{t("paste")}</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => void addFriend()}
              disabled={sending || !parsedCode}
              accessibilityRole="button"
              accessibilityLabel="Add friend"
              style={({ pressed }) => [
                styles.sendButton,
                parsedCode ? styles.sendButtonReady : null,
                pressed && { opacity: 0.8 },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Text style={[styles.addText, { color: parsedCode ? colors.ink : colors.lilac, fontFamily: ui.bodyBold }]}>{t("add")}</Text>
              )}
            </Pressable>
          </View>
          {inputInvalid ? (
            <Text style={[type.metadata, { color: colors.pink, fontFamily: ui.body }]}>{t("codeHint")}</Text>
          ) : null}
        </View>
      </View>

      {friendRequests.incoming.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Friend requests" count={friendRequests.incoming.length} />
          <View style={styles.list}>
            {friendRequests.incoming.map((r, i) => (
              <PersonRow
                key={r.id}
                first={i === 0}
                name={r.displayName}
                avatarKey={r.avatarKey}
                subtitle="Wants to be friends"
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
          </View>
        </View>
      ) : null}

      {friendRequestsError ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.md }]}>{friendRequestsError}</Text>
      ) : null}

      {friendLiveMoments.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Playing now" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRow}>
            {friendLiveMoments.map((m) => {
              const friend = m.friends?.[0];
              const friendName = friend?.displayName ?? "Friend";
              const total = withSeededCrowd(m).totalResponses;
              return (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [styles.liveCard, pressed && { opacity: 0.85 }]}
                  onPress={() => jumpToMoment(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Join ${friendName} on ${m.prompt}`}
                >
                  <View style={styles.liveTop}>
                    <AvatarImage displayName={friendName} avatarKey={friend?.avatarKey} size={28} />
                    <Text style={[type.bodySm, styles.liveName]} numberOfLines={1}>
                      {friendName}
                    </Text>
                    <View style={styles.liveDot} />
                  </View>
                  <Text style={[type.bodySm, { color: colors.paper }]} numberOfLines={2}>
                    {m.prompt}
                  </Text>
                  <View style={styles.liveFooter}>
                    <Text style={[type.metadata, { color: colors.lilac }]}>{formatCount(total)} playing</Text>
                    <View style={styles.joinChip}>
                      <Text style={[styles.joinText, { fontFamily: ui.bodyBold }]}>{t("join")}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title="Your friends" count={friends.length || undefined} />
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
                subtitle={formatFriendCode(friendCodeFor(f.userId))}
                mono
              >
                <IconButton
                  icon="person-remove-outline"
                  label={`Remove ${f.displayName}`}
                  busy={busy === `remove:${f.userId}`}
                  onPress={() => confirmRemove(f.userId, f.displayName)}
                  disabled={busy !== null}
                  subtle
                />
              </PersonRow>
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.empty]}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={26} color={colors.lilac} />
            </View>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: ui.bodyBold }]}>{t("noFriends")}</Text>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
              Send your invite link. Friends who open it are added straight away.
            </Text>
            <PrimaryButton
              label="Invite friends"
              icon="share-outline"
              onPress={() => void inviteFriends()}
              style={{ alignSelf: "stretch", marginTop: spacing.xs }}
            />
          </View>
        )}
      </View>

      {friendRequests.outgoing.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Sent requests" />
          <View style={styles.list}>
            {friendRequests.outgoing.map((r, i) => (
              <PersonRow
                key={r.id}
                first={i === 0}
                name={r.displayName}
                avatarKey={r.avatarKey}
                subtitle="Waiting for reply"
              >
                <Pressable
                  onPress={() => cancelRequest(r.id, r.displayName)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel request to ${r.displayName}`}
                >
                  {busy === `cancel:${r.id}` ? (
                    <ActivityIndicator size="small" color={colors.lime} />
                  ) : (
                    <Text style={[styles.textButtonLabel, { fontFamily: ui.bodyBold }]}>{t("cancel")}</Text>
                  )}
                </Pressable>
              </PersonRow>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Header({
  subtitle,
  onInvite,
  onLeaderboard,
}: {
  subtitle: string;
  onInvite: () => void;
  onLeaderboard?: () => void;
}) {
  const { t, fonts: ui } = useLanguage();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[type.screenTitle, { color: colors.paper, fontFamily: ui.display }]}>{t("friendsTitle")}</Text>
        <Text style={[type.bodySm, { color: colors.lilac }]}>{subtitle}</Text>
      </View>
      {onLeaderboard ? <IconButton icon="trophy-outline" label={t("leaderboard")} onPress={onLeaderboard} /> : null}
      <Pressable
        onPress={onInvite}
        accessibilityRole="button"
        accessibilityLabel={t("inviteFriends")}
        style={({ pressed }) => [styles.invitePill, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="person-add-outline" size={16} color={colors.ink} />
        <Text style={[styles.invitePillText, { fontFamily: ui.bodyBold }]}>{t("invite")}</Text>
      </Pressable>
    </View>
  );
}

function MyCodeRow({ playerId }: { playerId: string }) {
  const { t, fonts: ui } = useLanguage();
  const code = formatFriendCode(friendCodeFor(playerId));
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={styles.myIdRow}>
      <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{t("yourCode")}</Text>
      <Text style={styles.myId} numberOfLines={1} selectable>
        {code}
      </Text>
      <IconButton
        icon={copied ? "checkmark" : "copy-outline"}
        label={copied ? "Copied" : "Copy friend code"}
        tone={copied ? "lime" : "neutral"}
        onPress={() => void copy()}
        small
      />
      <IconButton
        icon="share-social-outline"
        label="Share invite link"
        onPress={() => void shareAppInvite(playerId, "friends_profile")}
        small
      />
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[type.micro, styles.sectionLabel]}>{title.toUpperCase()}</Text>
      {count ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PersonRow({
  name,
  avatarKey,
  subtitle,
  first,
  mono,
  children,
}: {
  name: string;
  avatarKey: string | null;
  subtitle: string;
  first: boolean;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.personRow, !first && styles.personDivider]}>
      <AvatarImage displayName={name} avatarKey={avatarKey} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.metadata, { color: colors.lilac }, mono && { fontFamily: fonts.mono }]} numberOfLines={1}>
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
  subtle,
  small,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  tone?: "neutral" | "lime";
  busy?: boolean;
  disabled?: boolean;
  subtle?: boolean;
  small?: boolean;
}) {
  const fg = tone === "lime" ? colors.ink : subtle ? colors.lilac : colors.paper;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        small && styles.iconButtonSmall,
        subtle && styles.iconButtonSubtle,
        tone === "lime" && styles.iconButtonLime,
        (pressed || (disabled && !busy)) && { opacity: 0.6 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={small ? 16 : 18} color={fg} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { paddingHorizontal: spacing.margin, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  invitePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
  },
  invitePillText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  hero: { marginTop: spacing.lg, alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.pinkFill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  heroTitle: { color: colors.paper, fontFamily: fonts.bodyBold, fontSize: 18, textAlign: "center" },
  heroBody: { color: colors.lilac, textAlign: "center", maxWidth: 300 },
  heroActions: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
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
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 4 },
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
  myIdRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  myId: { flex: 1, fontFamily: fonts.mono, fontSize: 16, lineHeight: 22, color: colors.lime, letterSpacing: 1 },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 42,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingLeft: 12,
    paddingRight: 6,
  },
  inputValid: { borderColor: colors.lime },
  inputInvalid: { borderColor: colors.pink },
  input: {
    flex: 1,
    height: "100%",
    color: colors.paper,
    fontFamily: fonts.mono,
    fontSize: 15,
    letterSpacing: 1,
  },
  pasteChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
  },
  pasteText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.paper },
  sendButton: {
    paddingHorizontal: 16,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonReady: { backgroundColor: colors.lime, borderColor: colors.lime },
  addText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  liveRow: { gap: spacing.sm, paddingRight: spacing.margin },
  liveCard: {
    width: 200,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  liveTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  liveName: { flex: 1, color: colors.paper, fontFamily: fonts.bodyBold },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.limeLive },
  liveFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "auto" },
  joinChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
  },
  joinText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.paper },
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
  iconButtonSmall: { width: 32, height: 32, borderRadius: 16 },
  iconButtonSubtle: { backgroundColor: "transparent", borderColor: "transparent" },
  iconButtonLime: { backgroundColor: colors.lime, borderColor: colors.lime },
  textButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  textButtonLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.lilac },
  empty: { alignItems: "center", paddingVertical: spacing.lg, gap: spacing.sm },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
});
