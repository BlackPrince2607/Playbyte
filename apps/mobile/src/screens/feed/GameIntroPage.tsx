import { StyleSheet, Text, View } from "react-native";
import { FeedGame } from "../../api";
import { PrimaryButton } from "../../components/PrimaryButton";
import { LivePill } from "../../components/PlayLogo";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  item: FeedGame;
  height: number;
  onStart: () => void;
};

export function GameIntroPage({ item, height, onStart }: Props) {
  return (
    <View style={[styles.page, { height }]}>
      <View style={styles.card}>
        <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 2 }]}>CASUAL</Text>
        <Text style={[type.screenTitle, { color: colors.paper, marginTop: spacing.md }]}>{item.title}</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>{item.blurb}</Text>
        <LivePill label="Tap to join the crowd" />
        <PrimaryButton label="Tap to start" onPress={onStart} style={{ marginTop: spacing.xl }} />
      </View>
      <Text style={[type.metadata, { color: colors.lilac, textAlign: "center", marginTop: spacing.lg }]}>
        Swipe up for next play
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.margin,
    paddingTop: 100,
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
