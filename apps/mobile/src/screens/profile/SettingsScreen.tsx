import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, isApiError, MeProfile, NotificationPreferences } from "../../api";
import { setSoundPref, useSoundPrefs } from "../../audio/sound";
import { AvatarImage } from "../../components/AvatarImage";
import { PlayerIdCard } from "../../components/PlayerIdCard";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SectionCard, SettingsRow } from "../../components/StitchPrimitives";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { pickAndUploadAvatar, removeAvatar } from "../../lib/avatarUpload";
import { APP_LANGUAGES, supportedLanguage } from "../../lib/languages";
import { legalLinks, SUPPORT_EMAIL, supportMailto } from "../../lib/links";
import { getLanguage, setLanguage } from "../../lib/storage";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onOpenNotifications: () => void;
  onOpenRecap: () => void;
  onSignIn: () => void;
};

const VISIBILITY_OPTIONS = ["public", "friends", "private"] as const;

const SOUND_ROWS = [
  { key: "music" as const, label: "Music" },
  { key: "sfx" as const, label: "Sound effects" },
];

const APP_VERSION = Constants.expoConfig?.version ?? "dev";
const LEGAL = legalLinks();

type DataRequestStatus = { id: string; status: "queued" | "processing" | "complete" | "failed"; downloadUrl?: string | null };

function openLink(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open link", url));
}

export function SettingsScreen({ onOpenNotifications, onOpenRecap, onSignIn }: Props) {
  const { isSignedIn, user, signOut } = useAuth();
  const { updateMe } = useApp();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  const [dataBusy, setDataBusy] = useState(false);
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
  const [language, setLanguageState] = useState("en");
  const sound = useSoundPrefs();
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => {
    void getLanguage().then((l) => setLanguageState(supportedLanguage(l)));
  }, []);

  function chooseLanguage(id: string) {
    setLanguageState(id);
    void setLanguage(id);
  }

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
      updateMe({ displayName: name });
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

  function setAvatar(avatarKey: string | null) {
    setMe((current) => (current ? { ...current, avatarKey } : current));
    updateMe({ avatarKey });
  }

  async function changePhoto() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const key = await pickAndUploadAvatar();
      if (key) setAvatar(key);
    } catch (e) {
      setAvatarError(isApiError(e) ? e.userMessage : "Could not upload that photo. Try another one.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function clearPhoto() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      await removeAvatar();
      setAvatar(null);
    } catch (e) {
      setAvatarError(isApiError(e) ? e.userMessage : "Could not remove your photo.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function requestExport() {
    if (dataBusy) return;
    setDataBusy(true);
    try {
      const res = await api<DataRequestStatus>("/v1/me/data-requests", {
        method: "POST",
        body: JSON.stringify({ type: "export" }),
      });
      setExportId(res.id);
      setDataStatus("We're preparing a copy of your data. Tap “Download my export” in a minute.");
    } catch (e) {
      setDataStatus(isApiError(e) ? e.userMessage : "Could not request your export.");
    } finally {
      setDataBusy(false);
    }
  }

  async function checkExport() {
    if (!exportId || dataBusy) return;
    setDataBusy(true);
    try {
      const res = await api<DataRequestStatus>(`/v1/me/data-requests/${exportId}`);
      if (res.status === "complete" && res.downloadUrl) {
        openLink(res.downloadUrl);
        setDataStatus("Your export opened in the browser. The link works for an hour.");
      } else if (res.status === "failed") {
        setExportId(null);
        setDataStatus("That export failed. Request it again.");
      } else {
        setDataStatus("Still preparing your export. Check again shortly.");
      }
    } catch (e) {
      setDataStatus(isApiError(e) ? e.userMessage : "Could not check your export.");
    } finally {
      setDataBusy(false);
    }
  }

  async function deleteAccount() {
    setDataBusy(true);
    try {
      await api("/v1/me/data-requests", { method: "POST", body: JSON.stringify({ type: "deletion" }) });
      Alert.alert("Deletion requested", "Your account and data will be deleted shortly. You've been signed out.");
      await signOut();
    } catch (e) {
      setDataStatus(isApiError(e) ? e.userMessage : "Could not request deletion. Try again.");
    } finally {
      setDataBusy(false);
    }
  }

  function confirmDeletion() {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your profile, photo, answers, scores, friends and comments, and signs you out. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void deleteAccount() },
      ],
    );
  }

  function reportProblem() {
    const details = [`App version: ${APP_VERSION}`, `Platform: ${Platform.OS} ${Platform.Version}`];
    if (me?.id) details.push(`Player ID: ${me.id}`);
    Linking.openURL(supportMailto("MAJA problem report", `\n\n---\n${details.join("\n")}`)).catch(() =>
      Alert.alert("Email us", `Write to ${SUPPORT_EMAIL} and tell us what went wrong.`),
    );
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

      <SectionCard title="Language" style={{ marginTop: spacing.md, marginBottom: 0 }}>
        <View style={styles.visRow}>
          {APP_LANGUAGES.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => chooseLanguage(l.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: language === l.id }}
              style={[styles.visChip, language === l.id && styles.visChipActive]}
            >
              <Text style={[type.bodySm, { color: language === l.id ? colors.ink : colors.paper }]}>{l.name}</Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Sound" style={{ marginTop: spacing.md, marginBottom: 0 }}>
        {SOUND_ROWS.map((r) => (
          <View key={r.key} style={styles.toggleRow}>
            <Text style={[type.bodyLg, { color: colors.paper, flex: 1 }]}>{r.label}</Text>
            <Switch
              value={sound[r.key]}
              onValueChange={(v) => setSoundPref(r.key, v)}
              accessibilityLabel={r.label}
              trackColor={{ true: colors.pink, false: colors.cardAlt }}
              thumbColor={colors.paper}
            />
          </View>
        ))}
      </SectionCard>

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
          {loadError ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={[type.bodySm, { color: colors.pink }]}>{loadError}</Text>
              {loadError.toLowerCase().includes("session") ? (
                <PrimaryButton label="Sign in again" onPress={onSignIn} />
              ) : (
                <PrimaryButton label="Retry" variant="secondary" onPress={() => void loadMe()} />
              )}
            </View>
          ) : null}

          {me ? (
            <View style={{ marginTop: spacing.md }}>
              <PlayerIdCard
                id={me.id}
                displayName={me.displayName}
                avatarKey={me.avatarKey}
                bio={me.bio}
                caption="Share this ID so friends can add you."
              />
            </View>
          ) : null}

          <SectionCard title="Account">
            <SettingsRow
              label="Profile"
              value={me?.displayName ?? "Edit display name"}
              onPress={() => setEditingProfile((v) => !v)}
            />
            <SettingsRow label="Email" value={user?.email ?? "—"} />
          </SectionCard>

          {editingProfile ? (
            <View style={styles.editCard}>
              <View style={styles.identity}>
                <AvatarImage displayName={me?.displayName ?? "Player"} avatarKey={me?.avatarKey} size={56} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <PrimaryButton
                    label={avatarBusy ? "Uploading…" : me?.avatarKey ? "Change photo" : "Add a photo"}
                    variant="secondary"
                    onPress={() => void changePhoto()}
                    disabled={avatarBusy}
                  />
                  {me?.avatarKey ? (
                    <Pressable onPress={() => void clearPhoto()} disabled={avatarBusy} accessibilityRole="button">
                      <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>Remove photo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {avatarError ? (
                <Text style={[type.bodySm, { color: colors.pink }]} accessibilityRole="alert">
                  {avatarError}
                </Text>
              ) : null}
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
            <SettingsRow label="Export my data" onPress={() => void requestExport()} />
            {exportId ? <SettingsRow label="Download my export" onPress={() => void checkExport()} /> : null}
            <SettingsRow label="Delete my data" value="Deletes your account" onPress={confirmDeletion} />
            {dataBusy ? <ActivityIndicator color={colors.lime} style={{ padding: spacing.sm }} /> : null}
            {dataStatus ? (
              <Text style={[type.bodySm, { color: colors.lime, padding: spacing.md }]}>{dataStatus}</Text>
            ) : null}
          </SectionCard>

          <SectionCard title="Content">
            <SettingsRow label="Weekly recap" onPress={onOpenRecap} />
          </SectionCard>

          <PrimaryButton label="Log Out" variant="secondary" onPress={() => void signOut()} />
        </>
      )}

      <SectionCard title="Support" style={{ marginTop: spacing.md }}>
        <SettingsRow label="Report a problem" value={SUPPORT_EMAIL} onPress={reportProblem} />
        {LEGAL ? (
          <>
            <SettingsRow label="Privacy policy" onPress={() => openLink(LEGAL.privacy)} />
            <SettingsRow label="How to delete your data" onPress={() => openLink(LEGAL.dataDeletion)} />
          </>
        ) : null}
      </SectionCard>
      <Text style={[type.micro, styles.version]}>MAJA v{APP_VERSION}</Text>
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
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
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
