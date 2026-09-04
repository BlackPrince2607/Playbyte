import { StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "../theme/colors";

type Props = { lines?: number };

export function LoadingSkeleton({ lines = 3 }: Props) {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <View key={i} style={[styles.line, i === 0 ? styles.short : undefined]} />
      ))}
      <View style={styles.block} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.margin, gap: spacing.sm, paddingTop: 120 },
  line: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
    width: "80%",
  },
  short: { width: "45%" },
  block: {
    marginTop: spacing.lg,
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
});
