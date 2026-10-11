import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, isApiError } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { useAuth } from "../../context/AuthContext";
import { seededCount } from "../../lib/seededEngagement";
import { getLocalProfile, setLocalProfile, type Gender } from "../../lib/storage";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BackButton, CtaButton, PulseDot, onboardingStyles } from "./ui";

type Props = { onNext: (name: string) => void; onBack: () => void };

const GENDERS: { id: Gender; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "male", label: "Male", icon: "male" },
  { id: "female", label: "Female", icon: "female" },
  { id: "other", label: "Other", icon: "person-outline" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withCommas(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function ProfileSetupScreen({ onNext, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { user, isSignedIn } = useAuth();
  const lockedEmail = user?.email ?? null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void getLocalProfile().then((local) => {
      if (!alive) return;
      const meta = user?.user_metadata ?? {};
      const accountName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
      setName((n) => n || local?.name || accountName);
      setEmail((e) => e || local?.email || "");
      setGender((g) => g ?? local?.gender ?? null);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const online = useMemo(() => 2800 + seededCount(new Date().toISOString().slice(0, 13), "responses") * 7, []);

  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= 2 && trimmedName.length <= 40;
  const shownEmail = lockedEmail ?? email;
  const emailOk = EMAIL_RE.test(shownEmail.trim());
  const emailBlocking = !lockedEmail && email.trim().length > 0 && !emailOk;

  async function submit() {
    if (!nameOk) {
      setError("Enter a name between 2 and 40 characters.");
      return;
    }
    if (emailBlocking) {
      setError("That email doesn't look right.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await setLocalProfile({ name: trimmedName, email: shownEmail.trim(), gender });
      if (isSignedIn) {
        await api("/v1/me/profile", { method: "PATCH", body: JSON.stringify({ displayName: trimmedName }) });
      }
      onNext(trimmedName);
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : "Could not save your details. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={onboardingStyles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.inner, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={onboardingStyles.header}>
          <BackButton onPress={onBack} plain />
        </View>

        <View style={styles.progress} accessibilityLabel="Step 4 of 5">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.segment, i < 3 && { backgroundColor: colors.pink }]} />
          ))}
        </View>

        <Text style={styles.title}>
          Create{"\n"}your <Text style={{ color: colors.pink }}>account</Text>
        </Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: 4, marginBottom: spacing.xl }]}>
          Just a few details to get started on Maja.
        </Text>

        <View style={styles.badgeCard}>
          <View>
            <AvatarImage displayName={trimmedName || "Player"} size={56} />
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={12} color={colors.ink} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Text style={styles.badgeTitle}>Gamer Badge Ready</Text>
              <View style={styles.lvl}>
                <Text style={styles.lvlText}>LVL 1</Text>
              </View>
            </View>
            <Text style={[type.metadata, { color: colors.lilac }]} numberOfLines={1}>
              {isSignedIn ? "Custom avatars are coming soon" : "Custom avatar unlocks after registration"}
            </Text>
          </View>
        </View>

        <View style={{ gap: 20 }}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <View>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor="rgba(143,127,192,0.4)"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                maxLength={40}
                returnKeyType="next"
                style={styles.input}
              />
              {nameOk ? <Ionicons name="checkmark-circle" size={20} color={surface.success} style={styles.inputIcon} /> : null}
            </View>
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Email</Text>
              {!lockedEmail ? <Text style={styles.hint}>Optional</Text> : null}
            </View>
            <View>
              <TextInput
                value={shownEmail}
                onChangeText={setEmail}
                editable={!lockedEmail}
                placeholder="name@domain.com"
                placeholderTextColor="rgba(143,127,192,0.4)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                style={[styles.input, lockedEmail ? { color: "rgba(245,240,255,0.75)" } : null]}
              />
              {emailOk ? <Ionicons name="checkmark-circle" size={20} color={surface.success} style={styles.inputIcon} /> : null}
            </View>
          </View>

          <View style={{ gap: spacing.sm, marginTop: 4 }}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Gender</Text>
              <Text style={styles.hint}>Optional for matchmaking</Text>
            </View>
            <View accessibilityRole="radiogroup" accessibilityLabel="Gender selection" style={styles.genders}>
              {GENDERS.map((g) => {
                const on = gender === g.id;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => setGender(on ? null : g.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.gender, on && styles.genderOn, pressed && { transform: [{ scale: 0.97 }] }]}
                  >
                    <Ionicons name={g.icon} size={24} color={on ? colors.paper : colors.lilac} />
                    <Text style={[styles.genderLabel, { color: on ? colors.paper : colors.lilac }]}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.online}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <PulseDot size={10} color={surface.lime} />
              <Text style={[type.metadata, { fontFamily: fonts.mono, color: colors.paper }]}>{withCommas(online)} online</Text>
            </View>
            <Text style={[type.micro, { color: colors.lilac }]}>Instant game queue</Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {error ? (
            <Text style={[type.bodySm, { color: colors.pinkSoft, textAlign: "center" }]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <CtaButton label={saving ? "Saving…" : "Continue"} icon={saving ? null : "arrow-forward"} onPress={() => void submit()} disabled={saving || !nameOk} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inner: { flexGrow: 1, paddingHorizontal: spacing.margin },
  progress: { flexDirection: "row", justifyContent: "center", gap: 6, paddingTop: 8, paddingBottom: spacing.lg },
  segment: { width: 24, height: 6, borderRadius: 3, backgroundColor: surface.high },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: colors.paper },
  badgeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginBottom: spacing.lg,
  },
  editBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: surface.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTitle: { ...type.metadata, fontFamily: fonts.bodyBold, color: colors.paper },
  lvl: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: "rgba(162,216,1,0.2)" },
  lvlText: { fontFamily: fonts.mono, fontSize: 10, color: surface.lime },
  field: { gap: 6 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { ...type.metadata, fontFamily: fonts.bodyMedium, color: colors.lilac, letterSpacing: 0.3 },
  hint: { ...type.micro, color: "rgba(143,127,192,0.6)" },
  input: {
    height: 56,
    paddingLeft: spacing.md,
    paddingRight: 44,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
    color: colors.paper,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  inputIcon: { position: "absolute", right: spacing.md, top: 18 },
  genders: { flexDirection: "row", gap: spacing.gutter },
  gender: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
  },
  genderOn: { backgroundColor: colors.pink, boxShadow: "0 6px 14px rgba(255,77,141,0.3)" },
  genderLabel: { ...type.metadata, fontFamily: fonts.bodyBold },
  online: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: "rgba(42,27,78,0.6)",
  },
});
