import Ionicons from "@expo/vector-icons/Ionicons";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isApiError, type MomentComment } from "../api";
import { COMMENT_MAX, deleteComment, fetchComments, postComment, reportComment } from "../lib/social";
import { timeAgo } from "../lib/timeAgo";
import { useMountedRef } from "../lib/useMounted";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";
import { AvatarImage } from "./AvatarImage";
import { PrimaryButton } from "./PrimaryButton";

type Props = {
  momentId: string;
  visible: boolean;
  onClose: () => void;
  isSignedIn: boolean;
  onSignIn?: () => void;
  onTotalChange: (total: number) => void;
};

const errorText = (e: unknown, fallback: string) =>
  isApiError(e) ? e.userMessage : e instanceof Error ? e.message : fallback;

export function CommentsSheet({ momentId, visible, onClose, isSignedIn, onSignIn, onTotalChange }: Props) {
  const insets = useSafeAreaInsets();
  const mounted = useMountedRef();
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  /** Drops responses from a previous open or moment. */
  const generation = useRef(0);

  const applyTotal = useCallback(
    (n: number) => {
      setTotal(n);
      onTotalChange(n);
    },
    [onTotalChange],
  );

  const loadFirst = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const page = await fetchComments(momentId);
      if (!mounted.current || gen !== generation.current) return;
      setComments(page.comments);
      setCursor(page.nextCursor);
      applyTotal(page.total);
    } catch (e) {
      if (mounted.current && gen === generation.current) setLoadError(errorText(e, "Could not load comments."));
    } finally {
      if (mounted.current && gen === generation.current) setLoading(false);
    }
  }, [momentId, mounted, applyTotal]);

  useEffect(() => {
    if (!visible) return;
    setPostError("");
    void loadFirst();
  }, [visible, loadFirst]);

  async function loadMore() {
    if (!cursor || loadingMore || loading) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const page = await fetchComments(momentId, cursor);
      if (!mounted.current || gen !== generation.current) return;
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.comments.filter((c) => !seen.has(c.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      /* the next scroll retries */
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setPostError("");
    try {
      const res = await postComment(momentId, body);
      if (!mounted.current) return;
      setComments((prev) => [res.comment, ...prev]);
      applyTotal(res.total);
      setDraft("");
    } catch (e) {
      if (mounted.current) setPostError(errorText(e, "Could not post your comment."));
    } finally {
      if (mounted.current) setPosting(false);
    }
  }

  function remove(c: MomentComment) {
    Alert.alert("Delete comment?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await deleteComment(momentId, c.id);
            if (!mounted.current) return;
            setComments((prev) => prev.filter((x) => x.id !== c.id));
            applyTotal(res.total);
          } catch (e) {
            Alert.alert("Could not delete", errorText(e, "Try again."));
          }
        },
      },
    ]);
  }

  function report(c: MomentComment) {
    Alert.alert("Report comment?", `Report ${c.author.displayName}'s comment for review?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: async () => {
          try {
            await reportComment(c.id);
            Alert.alert("Thanks", "We'll take a look.");
          } catch (e) {
            Alert.alert("Could not report", errorText(e, "Try again."));
          }
        },
      },
    ]);
  }

  const renderComment = ({ item: c }: { item: MomentComment }) => (
    <Pressable
      style={styles.row}
      onLongPress={() => (c.mine ? remove(c) : report(c))}
      delayLongPress={350}
      accessibilityHint={c.mine ? "Long press to delete" : "Long press to report"}
    >
      <AvatarImage displayName={c.author.displayName} avatarKey={c.author.avatarKey} size={34} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.metadata, { color: colors.lilac }]}>
          <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold }}>{c.mine ? "You" : c.author.displayName}</Text>
          {"  "}
          {timeAgo(c.createdAt)}
        </Text>
        <Text style={[type.bodySm, { color: colors.paper }]}>{c.body}</Text>
      </View>
      {c.mine ? (
        <Pressable onPress={() => remove(c)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete comment">
          <Ionicons name="trash-outline" size={16} color={colors.lilac} />
        </Pressable>
      ) : null}
    </Pressable>
  );

  let body: ReactNode;
  if (loading && comments.length === 0) {
    body = <ActivityIndicator color={colors.lime} style={styles.center} />;
  } else if (loadError && comments.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={[type.bodySm, { color: colors.pink, textAlign: "center" }]}>{loadError}</Text>
        <PrimaryButton label="Retry" variant="secondary" onPress={() => void loadFirst()} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        renderItem={renderComment}
        contentContainerStyle={comments.length ? styles.list : styles.center}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
            No comments yet. Start the conversation.
          </Text>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.lilac} /> : null}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close comments" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <Text style={[type.button, { color: colors.paper }]}>
              {total > 0 ? `${total} ${total === 1 ? "comment" : "comments"}` : "Comments"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.lilac} />
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>{body}</View>

          {isSignedIn ? (
            <View style={{ gap: spacing.xs }}>
              {postError ? (
                <Text style={[type.metadata, { color: colors.pink }]} accessibilityRole="alert">
                  {postError}
                </Text>
              ) : null}
              <View style={styles.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add a comment…"
                  placeholderTextColor={colors.lilac}
                  style={[type.bodySm, styles.input]}
                  maxLength={COMMENT_MAX}
                  multiline
                  editable={!posting}
                  accessibilityLabel="Comment"
                />
                <Pressable
                  onPress={() => void send()}
                  disabled={!draft.trim() || posting}
                  style={[styles.send, (!draft.trim() || posting) && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Post comment"
                >
                  {posting ? (
                    <ActivityIndicator color={colors.ink} size="small" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color={colors.ink} />
                  )}
                </Pressable>
              </View>
              {draft.length > COMMENT_MAX - 40 ? (
                <Text style={[type.micro, { color: colors.lilac, textAlign: "right" }]}>
                  {COMMENT_MAX - draft.length} left
                </Text>
              ) : null}
            </View>
          ) : onSignIn ? (
            <PrimaryButton
              label="Sign in to comment"
              onPress={() => {
                onClose();
                onSignIn();
              }}
            />
          ) : (
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>Sign in to comment.</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    height: "70%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  list: { paddingVertical: spacing.sm, gap: spacing.md },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingLeft: spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: { flex: 1, color: colors.paper, maxHeight: 96, paddingVertical: 6 },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
  },
});
