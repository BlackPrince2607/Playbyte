import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { api, isApiError, NotificationPreferences } from "../../api";
import { BackLink } from "../../components/BackLink";
import { ErrorState } from "../../components/ErrorState";
import { GuestGate } from "../../components/GuestGate";
import { ScreenLoading } from "../../components/ScreenLoading";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { peekPrefs, readPrefs, writePrefs } from "../../lib/profileCache";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = { onBack: () => void; onSignIn?: () => void };

type PrefKey = keyof NotificationPreferences;

export function NotificationsScreen({ onBack, onSignIn }: Props) {
  const { isSignedIn, user } = useAuth();
  const { t, fonts: ui } = useLanguage();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(() =>
    user?.id ? peekPrefs(user.id) : null,
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [updatingKeys, setUpdatingKeys] = useState<Set<PrefKey>>(new Set());

  const loadPrefs = useCallback(async () => {
    if (!isSignedIn || !user?.id) return;
    const uid = user.id;
    const cached = peekPrefs(uid) ?? (await readPrefs(uid));
    if (cached) {
      setPrefs(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setLoadError("");
    try {
      const res = await api<NotificationPreferences>("/v1/me/notification-preferences");
      setPrefs(res);
      void writePrefs(uid, res);
    } catch (e) {
      if (!cached) setLoadError(isApiError(e) ? e.userMessage : "Could not load preferences.");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    if (isSignedIn) void loadPrefs();
    else setPrefs(null);
  }, [isSignedIn, loadPrefs]);

  async function toggle(key: PrefKey, next: boolean) {
    if (!prefs || updatingKeys.has(key)) return;
    const prev = prefs[key];
    setUpdatingKeys((s) => new Set(s).add(key));
    setSaveError("");
    const nextPrefs = { ...prefs, [key]: next };
    setPrefs(nextPrefs);
    if (user?.id) void writePrefs(user.id, nextPrefs);
    try {
      await api("/v1/me/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: next }),
      });
    } catch (e) {
      setPrefs((current) => (current ? { ...current, [key]: prev } : current));
      if (user?.id) void writePrefs(user.id, { ...prefs, [key]: prev });
      setSaveError(isApiError(e) ? e.userMessage : "Could not save preference.");
    } finally {
      setUpdatingKeys((s) => {
        const nextSet = new Set(s);
        nextSet.delete(key);
        return nextSet;
      });
    }
  }

  if (!isSignedIn) {
    return (
      <View style={styles.wrap}>
        <BackLink onPress={onBack} style={styles.back} />
        <Text style={[type.screenTitle, { color: colors.paper, fontFamily: ui.display }]}>{t("notifications")}</Text>
        <GuestGate
          title={t("notifications")}
          message={t("signInToNotifications")}
          actionLabel={t("signIn")}
          onSignIn={isSupabaseConfigured() ? onSignIn : undefined}
        />
      </View>
    );
  }

  if (loading && !prefs) {
    return (
      <View style={styles.wrap}>
        <BackLink onPress={onBack} style={styles.back} />
        <ScreenLoading label={t("loadingPrefs")} />
      </View>
    );
  }

  if (loadError && !prefs) {
    return (
      <View style={styles.wrap}>
        <BackLink onPress={onBack} style={styles.back} />
        <ErrorState message={loadError} onRetry={() => void loadPrefs()} />
      </View>
    );
  }

  const rows = [
    { key: "liveNow" as const, label: "Live Now", sub: "Breaking moments worth reacting to" },
    { key: "trending" as const, label: "Trending Pulse", sub: "Polls gaining rapid volume" },
    { key: "friendActivity" as const, label: "Friend activity", sub: "When friends join a moment" },
  ];

  return (
    <View style={styles.wrap}>
      <BackLink onPress={onBack} style={styles.back} />
      <Text style={[type.screenTitle, { color: colors.paper, fontFamily: ui.display }]}>{t("notifications")}</Text>
      <Text style={[type.hero, { color: colors.paper, fontSize: 28, marginTop: spacing.sm }]}>
        Your game is getting social.
      </Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginVertical: spacing.sm }]}>
        Max 3 alerts per day. Toggle each type independently.
      </Text>
      {saveError ? (
        <Text style={[type.bodySm, { color: colors.pink, marginBottom: spacing.sm }]} accessibilityRole="alert">
          {saveError}
        </Text>
      ) : null}
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyLg, { color: colors.paper, fontWeight: "600" }]}>{r.label}</Text>
            <Text style={[type.metadata, { color: colors.lilac }]}>{r.sub}</Text>
          </View>
          <Switch
            value={prefs?.[r.key] ?? true}
            disabled={!prefs || updatingKeys.has(r.key)}
            onValueChange={(v) => void toggle(r.key, v)}
            trackColor={{ true: colors.pink, false: colors.cardAlt }}
            thumbColor={colors.paper}
          />
        </View>
      ))}
      <Text style={[type.metadata, styles.footer]}>
        Your choices are saved to your account. Push alerts aren’t switched on in this test build yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, padding: spacing.margin, paddingTop: 56 },
  back: { marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  footer: { color: colors.lilac, marginTop: spacing.lg, textAlign: "center", lineHeight: 18 },
});
