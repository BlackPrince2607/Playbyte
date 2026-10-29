import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { PrimaryButton } from "./PrimaryButton";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Tighter layout for sheets / inline cards. */
  compact?: boolean;
  style?: ViewStyle;
};

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  secondaryLabel,
  onSecondary,
  compact,
  style,
}: Props) {
  return (
    <View
      style={[styles.wrap, compact && styles.compact, style]}
      accessibilityRole="alert"
    >
      <Text style={[compact ? type.bodyLg : type.screenTitle, styles.title, compact && styles.titleCompact]}>
        {title}
      </Text>
      <Text style={[type.bodySm, styles.message]}>{message}</Text>
      {onRetry ? <PrimaryButton label={retryLabel} onPress={onRetry} /> : null}
      {onSecondary && secondaryLabel ? (
        <PrimaryButton label={secondaryLabel} variant="secondary" onPress={onSecondary} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.ink,
    padding: spacing.margin,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  compact: {
    flex: 0,
    backgroundColor: "transparent",
    padding: spacing.md,
    justifyContent: "flex-start",
  },
  title: {
    color: colors.paper,
    fontSize: 24,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 18,
    fontWeight: "700",
  },
  message: { color: colors.lilac, textAlign: "center" },
});
