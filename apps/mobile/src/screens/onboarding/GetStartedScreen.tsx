import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Share, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayLogo } from "../../components/PlayLogo";
import { PrimaryButton } from "../../components/PrimaryButton";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onContinue: () => void;
  onPlayTrivia?: () => void;
  onPlayGame?: () => void;
  onBack?: () => void;
};

const PREVIEWS = [
  {
    tag: "TRIVIA",
    title: "TRIVIA",
    blurb: "Quick-fire general knowledge. Jump into the live feed next.",
    badge: "Feed",
    accent: colors.pink,
    ctaVariant: "primary" as const,
    on: "trivia" as const,
  },
  {
    tag: "CYBER SPRINT",
    title: "CYBER SPRINT",
    blurb: "Test your reaction time. Opens a mini-game from the feed.",
    badge: "Game",
    accent: colors.lime,
    ctaVariant: "success" as const,
    on: "game" as const,
  },
  {
    tag: "GRIDLOCK",
    title: "GRIDLOCK",
    blurb: "Spatial puzzles waiting in Compete after setup.",
    badge: "Soon",
    accent: colors.lilac,
    ctaVariant: "secondary" as const,
    on: "continue" as const,
  },
];

export function GetStartedScreen({ onContinue, onPlayTrivia, onPlayGame, onBack }: Props) {
  const insets = useSafeAreaInsets();

  function handleCard(kind: "trivia" | "game" | "continue") {
    if (kind === "trivia") (onPlayTrivia ?? onContinue)();
    else if (kind === "game") (onPlayGame ?? onContinue)();
    else onContinue();
  }

  async function invite() {
    try {
      await Share.share({
        message: "Come play with me on PLAY — every swipe is a game.",
      });
    } catch {
      /* cancelled */
    }
  }

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={[colors.ink, "#241038", colors.ink]} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.header}>
          <PlayLogo soft />
          <Text style={[type.micro, { color: colors.pinkSoft }]}>● Live</Text>
        </View>

        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}
          >
            <Text style={[type.bodySm, { color: colors.lilac }]}>← Back</Text>
          </Pressable>
        ) : null}

        <Text style={[type.screenTitle, styles.title]}>Your game is waiting.</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>
          Moments and mini-games are waiting in your feed.
        </Text>

        <View style={styles.sectionHead}>
          <Text style={[type.bodySm, { color: colors.paper, fontFamily: fonts.bodyBold, letterSpacing: 2 }]}>
            WHAT YOU CAN PLAY
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {PREVIEWS.map((p) => (
            <View key={p.tag} style={styles.card}>
              <View style={[styles.cardHero, { borderBottomColor: p.accent }]}>
                <View style={[styles.viewers, { backgroundColor: p.accent }]}>
                  <Text style={[type.micro, { color: colors.ink, fontFamily: fonts.bodyBold }]}>{p.badge}</Text>
                </View>
                <Text style={[type.hero, { color: p.accent, fontSize: 28, opacity: 0.35 }]}>{p.title[0]}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={[type.gameQuestion, { color: colors.paper, fontSize: 24 }]}>{p.title}</Text>
                <Text style={[type.metadata, { color: colors.lilac, marginTop: spacing.xs, marginBottom: spacing.md }]}>
                  {p.blurb}
                </Text>
                <PrimaryButton
                  label={p.on === "continue" ? "Continue setup" : "Join Game"}
                  variant={p.ctaVariant}
                  trailingIcon="arrow-forward"
                  onPress={() => handleCard(p.on)}
                  style={{ paddingVertical: 10 }}
                />
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.challenge}>
          <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
            Make it more fun with friends
          </Text>
          <Text style={[type.metadata, { color: colors.lilac, marginTop: 4 }]}>
            Invite friends after you finish setup — then find them in the Friends tab.
          </Text>
        </View>

        <PrimaryButton label="Continue setup" onPress={onContinue} style={{ marginTop: spacing.md }} />
        <PrimaryButton
          label="Invite friends"
          variant="secondary"
          onPress={() => void invite()}
          style={{ marginTop: spacing.sm }}
          icon="share-outline"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { paddingHorizontal: spacing.margin },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.paper, marginTop: spacing.xl },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  row: { gap: spacing.md, paddingRight: spacing.margin },
  card: {
    width: 280,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  cardHero: {
    height: 140,
    backgroundColor: colors.cardAlt,
    borderBottomWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  viewers: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardBody: { padding: spacing.md },
  challenge: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
});
