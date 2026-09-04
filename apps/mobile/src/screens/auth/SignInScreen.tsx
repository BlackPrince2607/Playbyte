import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
};

export function SignInScreen({ onClose, onSuccess }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupNote, setSignupNote] = useState("");

  async function submit() {
    setError("");
    setSignupNote("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        setSignupNote("Check your email if confirmation is required, then sign in.");
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onClose} style={styles.close}>
        <Text style={[type.bodyLg, { color: colors.lilac }]}>✕</Text>
      </Pressable>

      <Text style={[type.screenTitle, { color: colors.paper }]}>Save your PLAY</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
        Keep streaks, friends, and recap — your guest progress carries over.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.lilac}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.lilac}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={[type.bodySm, { color: colors.pink }]}>{error}</Text> : null}
      {signupNote ? <Text style={[type.bodySm, { color: colors.lime }]}>{signupNote}</Text> : null}

      <PrimaryButton
        label={busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        onPress={() => void submit()}
      />

      <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")} style={styles.switch}>
        <Text style={[type.bodySm, { color: colors.lilac }]}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
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
