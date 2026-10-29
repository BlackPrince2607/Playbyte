import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  label?: string;
  style?: ViewStyle;
};

export function ScreenLoading({ label, style }: Props) {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityLabel={label ?? "Loading"}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator color={colors.lime} size="large" />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.margin,
  },
  label: {
    ...type.bodySm,
    color: colors.lilac,
    textAlign: "center",
  },
});
