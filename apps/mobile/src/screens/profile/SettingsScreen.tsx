import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, isApiError, MeProfile, NotificationPreferences } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SectionCard, SettingsRow } from "../../components/StitchPrimitives";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

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
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
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
      try {
        const p = await api<NotificationPreferences>("/v1/me/notification-preferences");
        setPrefs(p);
      } catch {
        /* prefs optional on vault */
      }
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
      await api("/v1/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ defaultVisibility: visibility }),
      });
      setSaveSuccess("Saved.");
      setEditingProfile(false);
      await loadMe();
    } catch (e) {
      setSaveError(isApiError(e) ? e.userMessage : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePref(key: keyof NotificationPreferences, next: boolean) {
    if (!prefs) return;
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: next });
    try {
      await api("/v1/me/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: next }),
      });
    } catch {
      setPrefs({ ...prefs, [key]: prev });
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

  const prefRows = useMemo(
    () =>
      [
        { key: "liveNow" as const, label: "Live Now alerts" },
        { key: "trending" as const, label: "Trending Pulse" },
        { key: "friendActivity" as const, label: "Friend activity" },
      ] as const,
    [],
  );

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Text style={[type.screenTitle, { color: colors.paper }]}>Settings</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.xs }]}>Vault · profile & preferences</Text>

      {!isSignedIn ? (
        <View style={styles.guestCard}>
          <Text style={[type.bodyLg, { color: colors.paper }]}>
            Guest player · sign in to save streaks, friends, and privacy controls.
          </Text>
          {isSupabaseConfigured() ? (
            <PrimaryButton label="Sign in or create account" onPress={onSignIn} />
          ) : null}
        </View>
      ) : loading && !me ? (
        <ActivityIndicator color={colors.lime} style={{ marginTop: spacing.lg }} />
      ) : (
        <>
          {loadError ? <Text style={[type.bodySm, { color: colors.pink }]}>{loadError}</Text> : null}

          <SectionCard title="Account">
            <SettingsRow
              label="Profile"
              value={me?.displayName ?? "Edit display name"}
              onPress={() => setEditingProfile((v) => !v)}
            />
            <SettingsRow label="Email" value={user?.email ?? "—"} />
            <SettingsRow label="Language" value="Managed in onboarding" />
          </SectionCard>

          {editingProfile ? (
            <View style={styles.editCard}>
              <View style={styles.identity}>
                <AvatarImage displayName={me?.displayName ?? "Player"} avatarKey={me?.avatarKey} size={56} />
              </View>
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
              {saveError ? (
                <Text style={[type.bodySm, { color: colors.pink }]} accessibilityRole="alert">
                  {saveError}
                </Text>
              ) : null}
              {saveSuccess ? <Text style={[type.bodySm, { color: colors.lime }]}>{saveSuccess}</Text> : null}
              <PrimaryButton
                label={saving ? "Saving…" : "Save profile"}
                onPress={() => void saveProfile()}
                disabled={saving}
              />
            </View>
          ) : null}

          <SectionCard title="Notifications">
            {prefRows.map((r) => (
              <View key={r.key} style={styles.toggleRow}>
                <Text style={[type.bodyLg, { color: colors.paper, flex: 1 }]}>{r.label}</Text>
                <Switch
                  value={prefs?.[r.key] ?? true}
                  onValueChange={(v) => void togglePref(r.key, v)}
                  trackColor={{ true: colors.pink, false: colors.cardAlt }}
                  thumbColor={colors.paper}
                />
              </View>
            ))}
            <SettingsRow label="All notification settings" onPress={onOpenNotifications} />
          </SectionCard>

          <SectionCard title="Privacy">
            <Text style={[type.metadata, { color: colors.lilac, paddingHorizontal: spacing.md, paddingTop: spacing.sm }]}>
              DEFAULT VISIBILITY
            </Text>
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
            <SettingsRow label="Save privacy" onPress={() => void saveProfile()} />
            <SettingsRow label="Export my data" onPress={() => void requestData("export")} />
            <SettingsRow label="Delete my data" onPress={() => void requestData("deletion")} />
            {dataStatus ? (
              <Text style={[type.bodySm, { color: colors.lime, padding: spacing.md }]}>{dataStatus}</Text>
            ) : null}
          </SectionCard>

          <SectionCard title="Content">
            <SettingsRow label="Weekly recap" onPress={onOpenRecap} />
            <SettingsRow label="Interests" value="Set during onboarding" />
          </SectionCard>

          <SectionCard title="Support">
            <SettingsRow label="Help" value="Coming soon" />
            <SettingsRow label="Report a problem" value="Email support@play.app" />
            <SettingsRow label="Community guidelines" value="Coming soon" />
          </SectionCard>

          <PrimaryButton label="Log Out" variant="secondary" onPress={() => void signOut()} />
          <Text style={[type.micro, styles.version]}>PLAY · Vault</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { padding: spacing.margin, paddingTop: 60, paddingBottom: 100, gap: spacing.sm },
  guestCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  identity: { marginBottom: spacing.sm },
  editCard: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    color: colors.paper,
  },
  bioInput: { minHeight: 80, textAlignVertical: "top" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  visRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  visChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  visChipActive: { backgroundColor: colors.lime },
  version: { color: colors.lilac, textAlign: "center", marginTop: spacing.md, fontFamily: fonts.body },
});
