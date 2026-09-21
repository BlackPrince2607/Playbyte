import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ResultBar } from "../../components/StitchPrimitives";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  score: number;
  percentile: number;
  gameTitle: string;
  onContinue: () => void;
  onShare?: () => void;
  optionBreakdown?: { label: string; percent: number; highlight?: boolean }[];
};

export function PostGameResultScreen({
  score,
  percentile,
  gameTitle,
  onContinue,
  onShare,
  optionBreakdown,
}: Props) {
  const nailedIt = percentile >= 50;
  const betterThan = Math.max(0, Math.min(100, percentile));

  return (
    <View style={styles.wrap}>
      <Text style={[type.hero, { color: colors.paper, textAlign: "center" }]}>
        {nailedIt ? "Strong run." : "Nice try."}
      </Text>
      <Text style={[type.metadata, styles.eyebrow]}>{gameTitle.toUpperCase()} · RESULT</Text>

      <View style={styles.scoreWrap}>
        <Text style={[type.largeScore, { color: colors.lime }]}>{score}</Text>
      </View>
      <Text style={[type.bodyLg, { color: colors.lilac }]}>
        Better than {betterThan}% of players today
      </Text>

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={[type.statsSm, { color: colors.paper }]}>{score}</Text>
          <Text style={[type.micro, { color: colors.lilac }]}>YOUR SCORE</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[type.statsSm, { color: colors.limeLive }]}>{betterThan}%</Text>
          <Text style={[type.micro, { color: colors.lilac, textAlign: "center" }]}>BETTER THAN{"\n"}PLAYERS</Text>
        </View>
      </View>

      {optionBreakdown && optionBreakdown.length > 0 ? (
        <View style={styles.bars}>
          <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 2, marginBottom: spacing.sm }]}>
            HOW THE CROWD VOTED
          </Text>
          {optionBreakdown.map((o) => (
            <ResultBar key={o.label} label={o.label} percent={o.percent} highlight={o.highlight} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton label="Keep playing" onPress={onContinue} trailingIcon="arrow-forward" />
        {onShare ? (
          <PrimaryButton label="Challenge a friend" variant="secondary" onPress={onShare} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.margin,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.lilac,
    letterSpacing: 2,
    marginTop: spacing.xs,
    fontFamily: fonts.bodyBold,
  },
  scoreWrap: { position: "relative", marginVertical: spacing.md },
  tiles: { flexDirection: "row", gap: spacing.sm, width: "100%", marginTop: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  bars: {
    width: "100%",
    marginTop: spacing.lg,
    backgroundColor: "rgba(33,21,64,0.6)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.xl },
});
