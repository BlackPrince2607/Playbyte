import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  initialError?: string;
};

export function SignInScreen({ onClose, onSuccess, initialError }: Props) {
  const { signIn, signUp, signInWithGoogle, googleAvailable } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode() {
    setError("");
    setInfo("");
    setMode((m) => (m === "signin" ? "signup" : "signin"));
  }

  async function submit() {
    if (busy) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        onSuccess?.();
        onClose();
      } else {
        const result = await signUp(email, password);
        if (result === "confirm_email") {
          setInfo(t("checkEmail"));
          setMode("signin");
          setPassword("");
          return;
        }
        onSuccess?.();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("couldNotAuth"));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    if (busy) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : t("googleFailed");
      if (!message.toLowerCase().includes("cancelled")) {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <View style={styles.wrap}>
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t("close")}>
          <Text style={[type.bodyLg, { color: colors.lilac }]}>✕</Text>
        </Pressable>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Sign-in unavailable</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
          This build is missing Supabase configuration. You can keep playing as a guest.
        </Text>
        <PrimaryButton label={t("continueGuest")} onPress={onClose} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t("close")}>
        <Text style={[type.bodyLg, { color: colors.lilac }]}>✕</Text>
      </Pressable>

      <Text style={[type.screenTitle, { color: colors.paper }]}>Save your progress</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
        Keep streaks, friends, and recap — your guest progress carries over.
      </Text>

      {googleAvailable ? (
        <PrimaryButton
          label={busy ? "…" : t("continueGoogle")}
          variant="secondary"
          onPress={() => void onGoogle()}
          disabled={busy}
          icon="logo-google"
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      {googleAvailable ? (
        <Text style={[type.micro, { color: colors.lilac, textAlign: "center", marginTop: spacing.md }]}>or</Text>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder={t("emailPlaceholder")}
        placeholderTextColor={colors.lilac}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        placeholder={t("passwordPlaceholder")}
        placeholderTextColor={colors.lilac}
        secureTextEntry
        textContentType={mode === "signup" ? "newPassword" : "password"}
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />

      {error ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.sm }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {info ? <Text style={[type.bodySm, { color: colors.lime, marginTop: spacing.sm }]}>{info}</Text> : null}

      <PrimaryButton
        label={busy ? "…" : mode === "signin" ? t("signIn") : t("createAccount")}
        onPress={() => void submit()}
        disabled={busy}
        style={{ marginTop: spacing.md }}
      />

      {busy ? <ActivityIndicator color={colors.lime} style={{ marginTop: spacing.md }} /> : null}

      <Pressable onPress={switchMode} style={styles.switch} disabled={busy}>
        <Text style={[type.bodySm, { color: colors.lilac }]}>
          {mode === "signin" ? t("newHere") : t("alreadyHave")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.ink,
    padding: spacing.margin,
    paddingTop: 56,
  },
  close: { alignSelf: "flex-end", padding: spacing.sm },
  input: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  switch: { marginTop: spacing.lg, alignItems: "center" },
});
