import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "success";
  style?: ViewStyle;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, variant = "primary", style, disabled }: Props) {
  const bg =
    variant === "primary" ? colors.pink : variant === "success" ? colors.lime : colors.cardAlt;
  const fg = variant === "success" ? colors.ink : colors.paper;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: pressed || disabled ? 0.85 : 1 },
        variant === "secondary" && styles.secondary,
        style,
      ]}
    >
      <Text style={[type.bodyLg, { color: fg, fontFamily: type.bodyLg.fontFamily, fontWeight: "700" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
  },
});
