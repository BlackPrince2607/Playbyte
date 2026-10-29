import { type ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { PrimaryButton } from "./PrimaryButton";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onSignIn?: () => void;
  style?: ViewStyle;
  children?: ReactNode;
};

export function GuestGate({ title, message, actionLabel, onSignIn, style, children }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={[type.bodyLg, styles.title]}>{title}</Text>
      {message ? <Text style={[type.bodySm, styles.message]}>{message}</Text> : null}
      {onSignIn && actionLabel ? (
        <PrimaryButton label={actionLabel} onPress={onSignIn} style={{ alignSelf: "stretch" }} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.paper,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    color: colors.lilac,
    textAlign: "center",
  },
});
