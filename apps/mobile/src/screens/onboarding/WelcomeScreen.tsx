import { useEffect, type ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onNext: () => void;
  onGoogleSignIn?: () => void;
  onEmailSignIn?: () => void;
  googleAvailable?: boolean;
};

function FloatingCard({
  rotate,
  baseY,
  scale,
  opacity,
  duration,
  children,
}: {
  rotate: string;
  baseY: number;
  scale: number;
  opacity: number;
  duration: number;
  children: ReactNode;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [duration, t]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate },
      { translateY: baseY + t.value * 10 },
      { scale },
    ],
    opacity,
  }));
  return <Animated.View style={[styles.floatCard, style]}>{children}</Animated.View>;
}

export function WelcomeScreen({ onNext, onGoogleSignIn, onEmailSignIn, googleAvailable }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.wrap}>
      <View style={[styles.blurPink, { top: insets.top }]} />
      <View style={styles.blurLime} />

      <View style={[styles.stack, { paddingTop: insets.top + 24 }]}>
        <FloatingCard rotate="-6deg" baseY={56} scale={0.9} opacity={0.8} duration={7000}>
          <Text style={[type.metadata, { color: colors.lilac }]}>FUNNY POLL</Text>
          <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 22, marginTop: 8 }]}>
            Chai or Coffee?
          </Text>
          <View style={styles.miniRow}>
            <View style={styles.miniOpt}>
              <Text style={[type.bodySm, { color: colors.lilac }]}>Chai</Text>
            </View>
            <View style={styles.miniOpt}>
              <Text style={[type.bodySm, { color: colors.lilac }]}>Coffee</Text>
            </View>
          </View>
        </FloatingCard>

        <FloatingCard rotate="3deg" baseY={28} scale={0.95} opacity={0.9} duration={8000}>
          <Text style={[type.metadata, { color: colors.lilac }]}>BOLLYWOOD QUIZ</Text>
          <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 22, marginTop: 8 }]}>
            Name this movie...
          </Text>
          <View style={styles.imagePlaceholder} />
        </FloatingCard>

        <FloatingCard rotate="-2deg" baseY={0} scale={1} opacity={1} duration={6500}>
          <Text style={[type.metadata, { color: colors.lime, fontFamily: fonts.bodyBold, letterSpacing: 1 }]}>
            CRICKET PREDICT
          </Text>
          <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 24, marginTop: 8, marginBottom: 12 }]}>
            Who wins tonight?
          </Text>
          <View style={styles.answerRow}>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>Mumbai</Text>
          </View>
          <View style={[styles.answerRow, { marginTop: 8 }]}>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>Chennai</Text>
          </View>
        </FloatingCard>
      </View>

      <LinearGradient
        colors={["transparent", "rgba(21,14,43,0.95)", colors.ink]}
        style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={[type.micro, { color: colors.lime, fontFamily: fonts.bodyBold, letterSpacing: 1 }]}>
            LIVE MOMENTS READY
          </Text>
        </View>
        <Text style={[type.hero, { color: colors.paper, marginBottom: spacing.lg }]}>
          Every swipe is a game.
        </Text>
        <PrimaryButton label="Start playing" onPress={onNext} trailingIcon="arrow-forward" />
        {googleAvailable && onGoogleSignIn ? (
          <PrimaryButton
            label="Continue with Google"
            variant="secondary"
            onPress={onGoogleSignIn}
            icon="logo-google"
            style={{ marginTop: spacing.sm }}
          />
        ) : onEmailSignIn ? (
          <PrimaryButton
            label="Sign in with email"
            variant="secondary"
            onPress={onEmailSignIn}
            icon="mail-outline"
            style={{ marginTop: spacing.sm }}
          />
        ) : (
          <PrimaryButton
            label="Google sign-in soon"
            variant="secondary"
            disabled
            style={{ marginTop: spacing.sm }}
            icon="logo-google"
          />
        )}
        <Text style={[type.micro, styles.legal]}>
          Start playing continues as a guest. Sign in anytime in Vault to save progress. By continuing, you agree to
          our Terms of Service and Privacy Policy.
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  blurPink: {
    position: "absolute",
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,77,141,0.2)",
  },
  blurLime: {
    position: "absolute",
    left: -60,
    bottom: "40%",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(198,255,61,0.1)",
  },
  stack: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.margin,
  },
  floatCard: {
    position: "absolute",
    width: "92%",
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  miniRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  miniOpt: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    alignItems: "center",
  },
  imagePlaceholder: {
    marginTop: 12,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  answerRow: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottom: {
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.xl,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime },
  legal: { color: "rgba(143,127,192,0.6)", textAlign: "center", marginTop: spacing.md },
});
