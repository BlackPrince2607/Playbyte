import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/colors";
import { fonts } from "../../theme/typography";
import { BackButton, BrandDiamond, Glow, GoogleLogo, PulseDot, onboardingStyles, useFloat } from "./ui";

type Props = {
  onBack: () => void;
  onGuest: () => void;
  onGoogleSignIn?: () => void;
  onEmailSignIn?: () => void;
  googleAvailable?: boolean;
  busy?: boolean;
  /** Already signed in (e.g. came back to this step) — the auth button just continues. */
  signedInAs?: string | null;
  onContinueSignedIn?: () => void;
};

function Tile({
  emoji,
  label,
  labelColor,
  size,
  emojiSize,
  rotate,
  float,
  style,
  glow,
  border = "rgba(255,255,255,0.08)",
}: {
  emoji: string;
  label: string;
  labelColor: string;
  size: number;
  emojiSize: number;
  rotate: string;
  float: number;
  style: ViewStyle;
  glow?: string;
  border?: string;
}) {
  const bob = useFloat(float, 7);
  return (
    <Animated.View style={[styles.tileWrap, style, bob]}>
      <View
        style={[
          styles.tileShadow,
          { width: size, height: size, transform: [{ rotate }] },
          glow ? { boxShadow: `0 0 30px -5px ${glow}` } : null,
        ]}
      >
        <LinearGradient
          colors={["#2b1822", "#1a0e14"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: border }]}
        >
          <Text style={{ fontSize: emojiSize }}>{emoji}</Text>
          <Text style={[styles.tileLabel, { color: labelColor }]}>{label}</Text>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

function Sparkle({ children, style }: { children: ReactNode; style: TextStyle }) {
  return (
    <Text pointerEvents="none" style={[styles.sparkle, style]}>
      {children}
    </Text>
  );
}

export function WelcomeScreen({
  onBack,
  onGuest,
  onGoogleSignIn,
  onEmailSignIn,
  googleAvailable,
  busy,
  signedInAs,
  onContinueSignedIn,
}: Props) {
  const insets = useSafeAreaInsets();

  let auth: { label: string; onPress?: () => void; icon: ReactNode };
  if (signedInAs && onContinueSignedIn) {
    auth = {
      label: `Continue as ${signedInAs}`,
      onPress: onContinueSignedIn,
      icon: <Ionicons name="person-circle-outline" size={20} color={colors.paper} />,
    };
  } else if (googleAvailable && onGoogleSignIn) {
    auth = { label: "Continue with Google", onPress: onGoogleSignIn, icon: <GoogleLogo /> };
  } else if (onEmailSignIn) {
    auth = {
      label: "Continue with email",
      onPress: onEmailSignIn,
      icon: <Ionicons name="mail-outline" size={20} color={colors.paper} />,
    };
  } else {
    auth = { label: "Sign-in unavailable in this build", icon: <GoogleLogo /> };
  }

  return (
    <View style={[onboardingStyles.root, { backgroundColor: "#140a0e" }]}>
      <Glow color="rgba(255,77,141,0.35)" size={300} style={{ top: -60, right: -60 }} />
      <Glow color="rgba(124,58,237,0.3)" size={320} style={{ top: 170, left: -120 }} />
      <Glow color="rgba(255,77,141,0.22)" size={280} style={{ bottom: 120, right: -20 }} />

      <View style={[styles.body, { paddingTop: insets.top + 8 }]}>
        <View style={onboardingStyles.header}>
          <BackButton onPress={onBack} />
        </View>

        <View style={styles.cluster}>
          <View style={styles.orb} />
          <Tile emoji="⚽" label="Sports" labelColor="rgba(255,255,255,0.5)" size={72} emojiSize={24} rotate="-12deg" float={3200} style={{ top: 8, left: 16 }} border="rgba(255,255,255,0.15)" />
          <Tile emoji="🍿" label="Cinema" labelColor={colors.pink} size={80} emojiSize={30} rotate="12deg" float={3800} style={{ top: 72, right: 12 }} glow="rgba(255,77,141,0.45)" border="rgba(255,77,141,0.2)" />
          <Tile emoji="💡" label="Quiz" labelColor="#fde047" size={88} emojiSize={36} rotate="-6deg" float={3400} style={{ top: 92, left: 40, zIndex: 2 }} glow="rgba(250,204,21,0.25)" border="rgba(250,204,21,0.3)" />
          <Tile emoji="🎵" label="Music" labelColor="#e9d5ff" size={80} emojiSize={30} rotate="6deg" float={4000} style={{ bottom: 12, right: 32, zIndex: 2 }} glow="rgba(124,58,237,0.35)" border="rgba(192,132,252,0.3)" />
          <Tile emoji="😄" label="Emoji" labelColor="rgba(255,255,255,0.6)" size={72} emojiSize={30} rotate="-6deg" float={3600} style={{ bottom: 8, left: 28 }} />
          <View style={styles.center}>
            <BrandDiamond />
          </View>
          <PulseDot size={10} color="#facc15" style={{ position: "absolute", top: -24, right: 110 }} />
          <Sparkle style={{ top: 32, right: 96, color: "#fde047", fontSize: 14 }}>✦</Sparkle>
          <Sparkle style={{ bottom: 64, left: 120, fontSize: 12 }}>✨</Sparkle>
          <Sparkle style={{ top: 56, left: 4, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>✦</Sparkle>
        </View>

        <Text style={styles.title}>
          Every swipe is{"\n"}a <Text style={[onboardingStyles.accent, { textShadowRadius: 16, textShadowColor: "rgba(255,77,141,0.6)" }]}>game.</Text>
        </Text>
        <Text style={styles.lede}>
          Quizzes, puzzles, polls, and instant trivia. Bite-sized multiplayer fun refreshed daily.
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={auth.onPress}
          disabled={!auth.onPress || busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.authBtn,
            pressed && { backgroundColor: "#321c27", transform: [{ scale: 0.98 }] },
            !auth.onPress && { opacity: 0.5 },
          ]}
        >
          {busy ? <ActivityIndicator color={colors.paper} /> : auth.icon}
          <Text style={styles.authLabel} numberOfLines={1}>
            {auth.label}
          </Text>
        </Pressable>
        <Pressable onPress={onGuest} disabled={busy} hitSlop={8} accessibilityRole="button" style={{ marginTop: 14 }}>
          <Text style={styles.guest}>Continue as guest</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 28 },
  cluster: { height: 310, marginVertical: "auto", justifyContent: "center", alignItems: "center" },
  orb: {
    position: "absolute",
    width: 220,
    height: 220,
    experimental_backgroundImage:
      "radial-gradient(circle, rgba(255,77,141,0.3) 0%, rgba(147,51,234,0.25) 40%, transparent 70%)",
  },
  center: { zIndex: 3 },
  tileWrap: { position: "absolute" },
  tileShadow: { borderRadius: 16, boxShadow: "0 12px 24px -6px rgba(0,0,0,0.7)" },
  tile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontFamily: fonts.bodyMedium, fontSize: 9, marginTop: 4 },
  sparkle: { position: "absolute" },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: "#fff" },
  lede: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 22,
    color: "rgba(252,231,243,0.7)",
    marginTop: 10,
    maxWidth: 290,
    marginBottom: spacing.lg,
  },
  footer: { paddingHorizontal: 28, paddingTop: spacing.sm },
  authBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: "#26171f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    boxShadow: "0 10px 20px rgba(0,0,0,0.35)",
  },
  authLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: "#fff", letterSpacing: 0.2, flexShrink: 1 },
  guest: { fontFamily: fonts.bodyMedium, fontSize: 13, color: "rgba(251,207,232,0.6)", textAlign: "center" },
});
