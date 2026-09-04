import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, isApiError, MeProfile } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  onOpenNotifications: () => void;
  onOpenRecap: () => void;
  onSignIn: () => void;
};

const VISIBILITY_OPTIONS = ["public", "friends", "private"] as const;

export function SettingsScreen({ onOpenNotifications, onOpenRecap, onSignIn }: Props) {
  const { isSignedIn, user, signOut } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] = useState<(typeof VISIBILITY_OPTIONS)[number]>("friends");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [dataStatus, setDataStatus] = useState("");
  const loadedUserId = useRef<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!isSignedIn) {
      setMe(null);
      loadedUserId.current = null;
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const profile = await api<MeProfile>("/v1/me");
      setMe(profile);
      setDisplayName(profile.displayName ?? "");
      setBio(profile.bio ?? "");
      setVisibility(profile.defaultVisibility ?? "friends");
      loadedUserId.current = user?.id ?? null;
    } catch (e) {
      setLoadError(isApiError(e) ? e.userMessage : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    if (!isSignedIn) {
      setMe(null);
      loadedUserId.current = null;
      return;
    }
    if (loadedUserId.current === user?.id && me) return;
    void loadMe();
  }, [isSignedIn, user?.id, me, loadMe]);

  async function saveProfile() {
    const name = displayName.trim();
    if (!name) {
      setSaveError("Display name cannot be empty.");
      return;
    }
    if (name.length > 40) {
      setSaveError("Display name must be 40 characters or less.");
      return;
    }
    if (bio.length > 160) {
      setSaveError("Bio must be 160 characters or less.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      await api("/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: name, bio: bio.trim() || null }),
      });
      const prevVisibility = me?.defaultVisibility;
      if (prevVisibility === undefined || visibility !== prevVisibility) {
        await api("/v1/me/privacy", {
          method: "PATCH",
          body: JSON.stringify({ defaultVisibility: visibility }),
        });
      }
      setSaveSuccess("Profile saved.");
      await loadMe();
    } catch (e) {
      setSaveError(isApiError(e) ? e.userMessage : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function requestData(kind: "export" | "deletion") {
    try {
      await api("/v1/me/data-requests", { method: "POST", body: JSON.stringify({ type: kind }) });
      setDataStatus(`${kind} request queued.`);
    } catch (e) {
      setDataStatus(isApiError(e) ? e.userMessage : "Sign in required.");
    }
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Text style={[type.screenTitle, { color: colors.paper }]}>You</Text>

      {isSignedIn ? (
        loading && !me ? (
          <ActivityIndicator color={colors.lime} style={{ marginTop: spacing.lg }} />
        ) : (
          <>
            {loadError ? <Text style={[type.bodySm, { color: colors.pink }]}>{loadError}</Text> : null}
            <View style={styles.identity}>
              <AvatarImage displayName={me?.displayName ?? "Player"} avatarKey={me?.avatarKey} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodySm, { color: colors.lilac }]}>{user?.email}</Text>
              </View>
            </View>

            <View style={styles.editCard}>
              <Text style={[type.metadata, { color: colors.lilac }]}>DISPLAY NAME</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={40}
                style={styles.input}
                placeholderTextColor={colors.lilac}
              />
              <Text style={[type.metadata, { color: colors.lilac, marginTop: spacing.sm }]}>BIO</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                maxLength={160}
                multiline
                style={[styles.input, styles.bioInput]}
                placeholder="Tell the crowd a little about you"
                placeholderTextColor={colors.lilac}
              />
              <Text style={[type.metadata, { color: colors.lilac, marginTop: spacing.sm }]}>DEFAULT VISIBILITY</Text>
              <View style={styles.visRow}>
                {VISIBILITY_OPTIONS.map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setVisibility(v)}
                    style={[styles.visChip, visibility === v && styles.visChipActive]}
                  >
                    <Text style={[type.bodySm, { color: visibility === v ? colors.ink : colors.paper }]}>{v}</Text>
                  </Pressable>
                ))}
              </View>
              {saveError ? (
                <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.sm }]} accessibilityRole="alert">
                  {saveError}
                </Text>
              ) : null}
              {saveSuccess ? (
                <Text style={[type.bodySm, { color: colors.lime, marginTop: spacing.sm }]}>{saveSuccess}</Text>
              ) : null}
              <PrimaryButton
                label={saving ? "Saving…" : "Save profile"}
                onPress={() => void saveProfile()}
                disabled={saving}
                style={{ marginTop: spacing.md }}
              />
            </View>
          </>
        )
      ) : (
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
          Guest player · sign in to save streaks, friends, and privacy controls.
        </Text>
      )}

      {!isSignedIn && isSupabaseConfigured() ? (
        <PrimaryButton label="Sign in or create account" onPress={onSignIn} />
      ) : null}

      <Pressable style={styles.row} onPress={onOpenNotifications}>
        <Text style={[type.bodyLg, { color: colors.paper }]}>Notifications</Text>
        <Text style={{ color: colors.lilac }}>›</Text>
      </Pressable>

      {isSignedIn ? (
        <Pressable style={styles.row} onPress={onOpenRecap}>
          <Text style={[type.bodyLg, { color: colors.paper }]}>Weekly recap</Text>
          <Text style={{ color: colors.lilac }}>›</Text>
        </Pressable>
      ) : null}

      {isSignedIn ? (
        <View style={styles.section}>
          <Text style={[type.metadata, { color: colors.lilac, marginBottom: spacing.sm }]}>PRIVACY</Text>
          <PrimaryButton label="Export my data" variant="secondary" onPress={() => void requestData("export")} />
          <PrimaryButton label="Delete my data" variant="secondary" onPress={() => void requestData("deletion")} />
          {dataStatus ? <Text style={[type.bodySm, { color: colors.lime }]}>{dataStatus}</Text> : null}
          <PrimaryButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { padding: spacing.margin, paddingTop: 60, paddingBottom: 100, gap: spacing.md },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  editCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
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
  bioInput: { minHeight: 80, textAlignVertical: "top" },
  visRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  visChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  visChipActive: { backgroundColor: colors.lime },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  section: { marginTop: spacing.lg, gap: spacing.sm },
});
