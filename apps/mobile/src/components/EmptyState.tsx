import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./PrimaryButton";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={[type.bodyLg, { color: colors.paper, fontWeight: "700", textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[type.bodySm, styles.message]}>{message}</Text> : null}
      {onAction && actionLabel ? <PrimaryButton label={actionLabel} variant="secondary" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: spacing.margin,
    paddingTop: 120,
    gap: spacing.md,
    alignItems: "center",
  },
  message: { color: colors.lilac, textAlign: "center" },
});
