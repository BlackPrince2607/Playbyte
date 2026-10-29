import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { PrimaryButton } from "./PrimaryButton";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

export function EmptyState({ title, message, actionLabel, onAction, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={[type.bodyLg, styles.title]}>{title}</Text>
      {message ? <Text style={[type.bodySm, styles.message]}>{message}</Text> : null}
      {onAction && actionLabel ? <PrimaryButton label={actionLabel} variant="secondary" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: spacing.margin,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    color: colors.paper,
    fontWeight: "700",
    textAlign: "center",
  },
  message: { color: colors.lilac, textAlign: "center" },
});
