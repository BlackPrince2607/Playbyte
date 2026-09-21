import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = { onNext: () => void };

function FloatingCard({
  rotate,
  translateY,
  scale,
  opacity,
  children,
}: {
  rotate: string;
  translateY: number;
  scale: number;
  opacity: number;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.floatCard,
        {
          transform: [{ rotate }, { translateY }, { scale }],
          opacity,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function WelcomeScreen({ onNext }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.wrap}>
      <View style={[styles.blurPink, { top: insets.top }]} />
      <View style={styles.blurLime} />

      <View style={[styles.stack, { paddingTop: insets.top + 24 }]}>
        <FloatingCard rotate="-6deg" translateY={56} scale={0.9} opacity={0.8}>
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

        <FloatingCard rotate="3deg" translateY={28} scale={0.95} opacity={0.9}>
          <Text style={[type.metadata, { color: colors.lilac }]}>BOLLYWOOD QUIZ</Text>
          <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 22, marginTop: 8 }]}>
            Name this movie...
          </Text>
          <View style={styles.imagePlaceholder} />
        </FloatingCard>

        <FloatingCard rotate="-2deg" translateY={0} scale={1} opacity={1}>
          <Text style={[type.metadata, { color: colors.lime, fontFamily: fonts.bodyBold, letterSpacing: 1 }]}>
            CRICKET PREDICT
          </Text>
          <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 24, marginTop: 8, marginBottom: 12 }]}>
            Who wins tonight?
          </Text>
          <View style={styles.answerRow}>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>Mumbai</Text>
            <Text style={[type.statsSm, { color: colors.lilac }]}>52%</Text>
          </View>
          <View style={[styles.answerRow, { marginTop: 8 }]}>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>Chennai</Text>
            <Text style={[type.statsSm, { color: colors.lilac }]}>48%</Text>
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
        <PrimaryButton
          label="Google sign-in soon"
          variant="secondary"
          onPress={onNext}
          icon="person-circle-outline"
          style={{ marginTop: spacing.sm, opacity: 0.75 }}
        />
        <Text style={[type.micro, styles.legal]}>
          Continues as guest for now. Email sign-in is available later in Vault. By continuing, you agree to our
          Terms of Service and Privacy Policy.
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
