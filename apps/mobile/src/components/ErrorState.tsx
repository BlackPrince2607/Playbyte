import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./PrimaryButton";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
}: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={[type.screenTitle, { color: colors.paper, fontSize: 24 }]}>{title}</Text>
      <Text style={[type.bodySm, styles.message]}>{message}</Text>
      {onRetry ? <PrimaryButton label={retryLabel} onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.ink,
    padding: spacing.margin,
    justifyContent: "center",
    gap: spacing.md,
  },
  message: { color: colors.lilac, textAlign: "center" },
});
