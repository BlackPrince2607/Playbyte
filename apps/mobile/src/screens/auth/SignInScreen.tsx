import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CloseButton } from "../../components/CloseButton";
import { PrimaryButton } from "../../components/PrimaryButton";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  initialError?: string;
};

export function SignInScreen({ onClose, onSuccess, initialError }: Props) {
  const { signInWithGoogle, googleAvailable } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);

  async function onGoogle() {
    if (busy) return;
    setError("");
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

  if (!isSupabaseConfigured() || !googleAvailable) {
    return (
      <View style={styles.wrap}>
        <CloseButton onPress={onClose} style={styles.close} />
        <Text style={[type.screenTitle, { color: colors.paper }]}>{t("signInUnavailable")}</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
          This build is missing sign-in configuration. You can keep playing as a guest.
        </Text>
        <PrimaryButton label={t("continueGuest")} onPress={onClose} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <CloseButton onPress={onClose} style={styles.close} />

      <Text style={[type.screenTitle, { color: colors.paper }]}>Save your progress</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
        Keep streaks, friends, and recap — your guest progress carries over.
      </Text>

      <PrimaryButton
        label={t("continueGoogle")}
        variant="secondary"
        onPress={() => void onGoogle()}
        busy={busy}
        icon="logo-google"
        style={{ marginTop: spacing.lg }}
      />

      {error ? (
        <Text style={[type.bodySm, { color: colors.pink, marginTop: spacing.sm }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
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
});
