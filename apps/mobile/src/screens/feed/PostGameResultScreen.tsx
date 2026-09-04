import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PlayLogo } from "../../components/PlayLogo";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  score: number;
  percentile: number;
  gameTitle: string;
  onContinue: () => void;
  onShare?: () => void;
};

export function PostGameResultScreen({ score, percentile, gameTitle, onContinue, onShare }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={[type.metadata, { color: colors.lilac }]}>{gameTitle.toUpperCase()}</Text>
      <Text style={[type.largeScore, { color: colors.lime, marginVertical: spacing.md }]}>{score}</Text>
      <Text style={[type.bodyLg, { color: colors.paper, textAlign: "center" }]}>
        Better than <Text style={{ color: colors.lime, fontWeight: "700" }}>{percentile}%</Text> of players today
      </Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm, textAlign: "center" }]}>
        No leaderboard — just showing up with the crowd.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Keep playing" onPress={onContinue} />
        {onShare ? <PrimaryButton label="Share result" variant="secondary" onPress={onShare} /> : null}
      </View>
      <PlayLogo size="sm" />
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
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.xl },
});
