import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, isApiError, MeProfile, NotificationPreferences } from "../../api";
import { setSoundPref, useSoundPrefs } from "../../audio/sound";
import { AvatarImage } from "../../components/AvatarImage";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SectionCard, SettingsRow, ToggleRow } from "../../components/StitchPrimitives";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { pickAndUploadAvatar, removeAvatar } from "../../lib/avatarUpload";
import { useLanguage } from "../../context/LanguageContext";
import { APP_LANGUAGES } from "../../lib/languages";
import { legalLinks, SUPPORT_EMAIL, supportMailto } from "../../lib/links";
import { formatFriendCode, friendCodeFor } from "../../lib/friendCode";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onOpenNotifications: () => void;
  onOpenRecap: () => void;
  onSignIn: () => void;
};

type Visibility = "public" | "friends" | "private";

const VISIBILITY_OPTIONS: { id: Visibility; label: string }[] = [
  { id: "public", label: "Public" },
  { id: "friends", label: "Friends" },
  { id: "private", label: "Private" },
];

const VISIBILITY_HINT: Record<Visibility, string> = {
  public: "Anyone can see your answers on moments.",
  friends: "Only your friends can see your answers.",
  private: "Your answers are only visible to you.",
};

const APP_VERSION = Constants.expoConfig?.version ?? "dev";
const LEGAL = legalLinks();

type DataRequestStatus = { id: string; status: "queued" | "processing" | "complete" | "failed"; downloadUrl?: string | null };

function openLink(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open link", url));
}

export function SettingsScreen({ onOpenNotifications, onOpenRecap, onSignIn }: Props) {
  const insets = useSafeAreaInsets();
  const { isSignedIn, user, signOut } = useAuth();
  const { language, setAppLanguage, t, fonts: ui } = useLanguage();
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
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [visibilityError, setVisibilityError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [dataStatus, setDataStatus] = useState("");
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const sound = useSoundPrefs();
  const loadedUserId = useRef<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  function chooseLanguage(id: string) {
    setAppLanguage(id);
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
      setLoadError(isApiError(e) ? e.userMessage : t("couldNotLoadProfile"));
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

  function startEditing() {
    setDisplayName(me?.displayName ?? "");
    setBio(me?.bio ?? "");
    setSaveError("");
    setSaveSuccess("");
    setEditingProfile(true);
  }

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
      setSaveSuccess("Profile saved.");
      updateMe({ displayName: name });
      setEditingProfile(false);
      await loadMe();
    } catch (e) {
      setSaveError(isApiError(e) ? e.userMessage : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseVisibility(next: Visibility) {
    if (next === visibility) return;
    const prev = visibility;
    setVisibility(next);
    setVisibilityError("");
    try {
      await api("/v1/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ defaultVisibility: next }),
      });
    } catch (e) {
      setVisibility(prev);
      setVisibilityError(isApiError(e) ? e.userMessage : "Could not update your privacy setting.");
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

  async function copyPlayerId() {
    if (!me?.id) return;
    await Clipboard.setStringAsync(formatFriendCode(friendCodeFor(me.id)));
    setIdCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setIdCopied(false), 2000);
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
        { text: t("cancel"), style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void deleteAccount() },
      ],
    );
  }

  function confirmSignOut() {
    Alert.alert(t("logOutTitle"), t("logOutBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logOut"), style: "destructive", onPress: () => void signOut() },
    ]);
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
        { key: "liveNow" as const, label: t("liveNowAlerts"), icon: "radio-outline" as const },
        { key: "trending" as const, label: t("trendingPulse"), icon: "trending-up-outline" as const },
        { key: "friendActivity" as const, label: t("friendActivity"), icon: "people-outline" as const },
      ] as const,
    [t],
  );

  const preferences = (
    <SectionCard title={t("preferences")}>
      <View style={styles.blockRow}>
        <View style={styles.blockHeader}>
          <View style={styles.blockIcon}>
            <Ionicons name="language-outline" size={18} color={colors.paper} />
          </View>
          <Text style={[type.bodyLg, { color: colors.paper, fontFamily: ui.body }]}>{t("language")}</Text>
        </View>
        <Segmented
          options={APP_LANGUAGES.map((l) => ({ id: l.id, label: l.name }))}
          value={language}
          onChange={chooseLanguage}
        />
      </View>
      <ToggleRow
        label={t("music")}
        icon="musical-notes-outline"
        value={sound.music}
        onValueChange={(v) => setSoundPref("music", v)}
      />
      <ToggleRow
        label={t("soundEffects")}
        icon="volume-high-outline"
        value={sound.sfx}
        onValueChange={(v) => setSoundPref("sfx", v)}
      />
    </SectionCard>
  );

  const support = (
    <SectionCard title={t("support")}>
      <SettingsRow label={t("reportProblem")} value={SUPPORT_EMAIL} icon="bug-outline" onPress={reportProblem} />
      {LEGAL ? (
        <SettingsRow label={t("privacyPolicy")} icon="document-text-outline" onPress={() => openLink(LEGAL.privacy)} />
      ) : null}
      {LEGAL ? (
        <SettingsRow
          label={t("howToDelete")}
          icon="help-circle-outline"
          onPress={() => openLink(LEGAL.dataDeletion)}
        />
      ) : null}
    </SectionCard>
  );

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[styles.inner, { paddingTop: insets.top + spacing.md }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[type.screenTitle, styles.title, { fontFamily: ui.display }]}>{t("settings")}</Text>

      {!isSignedIn ? (
        <>
          <View style={[styles.card, styles.guestCard]}>
            <View style={styles.guestIcon}>
              <Ionicons name="person-outline" size={26} color={colors.pink} />
            </View>
            <Text style={[type.bodyLg, styles.guestTitle, { fontFamily: ui.body }]}>{t("guestTitle")}</Text>
            <Text style={[type.bodySm, styles.guestBody]}>
              Sign in to save your streaks, add friends and control your privacy.
            </Text>
            {isSupabaseConfigured() ? (
              <PrimaryButton label="Sign in or create account" onPress={onSignIn} style={{ alignSelf: "stretch" }} />
            ) : null}
          </View>
          {preferences}
          {support}
        </>
      ) : loading && !me ? (
        <ActivityIndicator color={colors.lime} style={{ marginVertical: spacing.xl }} />
      ) : (
        <>
          {loadError ? (
            <View style={[styles.card, styles.errorCard]}>
              <Text style={[type.bodySm, { color: colors.pink }]}>{loadError}</Text>
              {loadError.toLowerCase().includes("session") ? (
                <PrimaryButton label="Sign in again" onPress={onSignIn} />
              ) : (
                <PrimaryButton label="Retry" variant="secondary" onPress={() => void loadMe()} />
              )}
            </View>
          ) : null}

          {me ? (
            <View style={[styles.card, styles.profileCard]}>
              <View style={styles.profileHeader}>
                <AvatarImage
                  displayName={me.displayName}
                  avatarKey={me.avatarKey}
                  size={64}
                  style={styles.profileAvatar}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {me.displayName}
                  </Text>
                  {user?.email ? (
                    <Text style={[type.metadata, { color: colors.lilac }]} numberOfLines={1}>
                      {user.email}
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => void copyPlayerId()}
                    accessibilityRole="button"
                    accessibilityLabel="Copy friend code"
                    hitSlop={6}
                    style={styles.idChip}
                  >
                    <Text style={styles.idText}>{formatFriendCode(friendCodeFor(me.id))}</Text>
                    <Ionicons
                      name={idCopied ? "checkmark" : "copy-outline"}
                      size={12}
                      color={idCopied ? colors.lime : colors.lilac}
                    />
                  </Pressable>
                </View>
              </View>
              {me.bio && !editingProfile ? (
                <Text style={[type.bodySm, { color: colors.paper, opacity: 0.85 }]} numberOfLines={3}>
                  {me.bio}
                </Text>
              ) : null}
              {saveSuccess && !editingProfile ? (
                <Text style={[type.metadata, { color: colors.lime }]}>{saveSuccess}</Text>
              ) : null}

              {editingProfile ? (
                <View style={styles.editor}>
                  <View style={styles.photoRow}>
                    <Pressable
                      onPress={() => void changePhoto()}
                      disabled={avatarBusy}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.smallButton, (pressed || avatarBusy) && { opacity: 0.7 }]}
                    >
                      {avatarBusy ? (
                        <ActivityIndicator size="small" color={colors.paper} />
                      ) : (
                        <Ionicons name="camera-outline" size={16} color={colors.paper} />
                      )}
                      <Text style={styles.smallButtonText}>{me.avatarKey ? "Change photo" : "Add photo"}</Text>
                    </Pressable>
                    {me.avatarKey ? (
                      <Pressable
                        onPress={() => void clearPhoto()}
                        disabled={avatarBusy}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.smallButton, styles.smallButtonGhost, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={[styles.smallButtonText, { color: colors.lilac }]}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {avatarError ? (
                    <Text style={[type.bodySm, { color: colors.pink }]} accessibilityRole="alert">
                      {avatarError}
                    </Text>
                  ) : null}

                  <View style={styles.field}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={[type.micro, styles.fieldLabel]}>DISPLAY NAME</Text>
                      <Text style={[type.micro, { color: colors.lilac }]}>{displayName.length}/40</Text>
                    </View>
                    <TextInput
                      value={displayName}
                      onChangeText={setDisplayName}
                      maxLength={40}
                      style={styles.input}
                      placeholder="Your name"
                      placeholderTextColor={colors.lilac}
                    />
                  </View>
                  <View style={styles.field}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={[type.micro, styles.fieldLabel]}>BIO</Text>
                      <Text style={[type.micro, { color: colors.lilac }]}>{bio.length}/160</Text>
                    </View>
                    <TextInput
                      value={bio}
                      onChangeText={setBio}
                      maxLength={160}
                      multiline
                      style={[styles.input, styles.bioInput]}
                      placeholder="Tell the crowd a little about you"
                      placeholderTextColor={colors.lilac}
                    />
                  </View>
                  {saveError ? (
                    <Text style={[type.bodySm, { color: colors.pink }]} accessibilityRole="alert">
                      {saveError}
                    </Text>
                  ) : null}
                  <View style={styles.editorActions}>
                    <PrimaryButton
                      label={t("cancel")}
                      variant="secondary"
                      onPress={() => setEditingProfile(false)}
                      disabled={saving}
                      style={{ flex: 1 }}
                    />
                    <PrimaryButton
                      label={saving ? "Saving…" : "Save"}
                      onPress={() => void saveProfile()}
                      disabled={saving}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : (
                <PrimaryButton label="Edit profile" variant="secondary" icon="create-outline" onPress={startEditing} />
              )}
            </View>
          ) : null}

          {preferences}

          <SectionCard title={t("notifications")}>
            {prefRows.map((r) => (
              <ToggleRow
                key={r.key}
                label={r.label}
                icon={r.icon}
                value={prefs?.[r.key] ?? true}
                onValueChange={(v) => void togglePref(r.key, v)}
              />
            ))}
            <SettingsRow
              label="All notification settings"
              icon="notifications-outline"
              onPress={onOpenNotifications}
            />
          </SectionCard>

          <SectionCard title={t("privacy")}>
            <View style={styles.blockRow}>
              <View style={styles.blockHeader}>
                <View style={styles.blockIcon}>
                  <Ionicons name="eye-outline" size={18} color={colors.paper} />
                </View>
                <Text style={[type.bodyLg, { color: colors.paper, fontFamily: ui.body }]}>{t("whoSeesAnswers")}</Text>
              </View>
              <Segmented
                options={VISIBILITY_OPTIONS.map((o) => ({
                  id: o.id,
                  label: t(o.id === "public" ? "public" : o.id === "friends" ? "friendsVis" : "private"),
                }))}
                value={visibility}
                onChange={(v) => void chooseVisibility(v)}
              />
              <Text style={[type.metadata, { color: visibilityError ? colors.pink : colors.lilac }]}>
                {visibilityError || t(visibility === "public" ? "visPublic" : visibility === "friends" ? "visFriends" : "visPrivate")}
              </Text>
            </View>
          </SectionCard>

          <SectionCard title={t("activity")}>
            <SettingsRow label={t("weeklyRecap")} icon="calendar-outline" onPress={onOpenRecap} />
          </SectionCard>

          <SectionCard title={t("yourData")}>
            <SettingsRow
              label="Export my data"
              value="Get a copy of everything we store"
              icon="download-outline"
              onPress={() => void requestExport()}
              disabled={dataBusy}
            />
            {exportId ? (
              <SettingsRow
                label="Download my export"
                icon="cloud-download-outline"
                onPress={() => void checkExport()}
                disabled={dataBusy}
              />
            ) : null}
            <SettingsRow
              label="Delete account"
              value="Permanently removes your account and data"
              icon="trash-outline"
              destructive
              onPress={confirmDeletion}
              disabled={dataBusy}
              trailing={dataBusy ? <ActivityIndicator size="small" color={colors.lime} /> : undefined}
            />
          </SectionCard>
          {dataStatus ? <Text style={[type.bodySm, styles.dataStatus]}>{dataStatus}</Text> : null}

          {support}

          <Pressable
            onPress={confirmSignOut}
            accessibilityRole="button"
            style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.pink} />
            <Text style={[styles.signOutText, { fontFamily: ui.bodyBold }]}>{t("logOut")}</Text>
          </Pressable>
        </>
      )}

      <Text style={[type.micro, styles.version]}>MAJA v{APP_VERSION}</Text>
    </ScrollView>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { paddingHorizontal: spacing.margin, paddingBottom: spacing.xl },
  title: { color: colors.paper, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  guestCard: { alignItems: "center", paddingVertical: spacing.lg, gap: spacing.sm },
  guestIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.pinkFill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  guestTitle: { color: colors.paper, fontFamily: fonts.bodyBold, textAlign: "center" },
  guestBody: { color: colors.lilac, textAlign: "center", maxWidth: 300, marginBottom: spacing.sm },
  errorCard: { gap: spacing.sm, borderColor: colors.pinkGlow },
  profileCard: { gap: spacing.md, borderColor: colors.pinkGlow },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileAvatar: { borderWidth: 2, borderColor: colors.pink },
  profileName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.paper },
  idChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },
  idText: { fontFamily: fonts.mono, fontSize: 12, color: colors.lime },
  editor: { gap: spacing.md },
  photoRow: { flexDirection: "row", gap: spacing.sm },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  smallButtonGhost: { backgroundColor: "transparent" },
  smallButtonText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.paper },
  field: { gap: 6 },
  fieldLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { color: colors.lilac, letterSpacing: 1.2, fontFamily: fonts.bodyBold },
  input: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.paper,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  bioInput: { minHeight: 88, textAlignVertical: "top" },
  editorActions: { flexDirection: "row", gap: spacing.sm },
  blockRow: { paddingHorizontal: spacing.md, paddingVertical: 12, gap: spacing.sm },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  blockIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  segmented: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.lime },
  segmentText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.lilac },
  segmentTextOn: { fontFamily: fonts.bodyBold, color: colors.ink },
  dataStatus: { color: colors.lime, marginTop: -spacing.sm, marginBottom: spacing.lg, paddingHorizontal: 4 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.pinkGlow,
    backgroundColor: colors.pinkFill,
  },
  signOutText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.pink },
  version: { color: colors.lilac, textAlign: "center", marginTop: spacing.lg, fontFamily: fonts.body },
});
