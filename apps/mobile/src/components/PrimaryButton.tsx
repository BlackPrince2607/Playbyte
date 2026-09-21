import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "success";
  style?: ViewStyle;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
};

export function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  style,
  disabled,
  icon,
  trailingIcon,
}: Props) {
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
        {
          backgroundColor: bg,
          opacity: pressed || disabled ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        variant === "secondary" && styles.secondary,
        variant === "primary" && styles.primaryGlow,
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[type.button, { color: fg, fontFamily: fonts.bodyBold }]}>{label}</Text>
      {trailingIcon ? (
        <Ionicons name={trailingIcon} size={20} color={fg} style={{ marginLeft: 8 }} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  primaryGlow: {
    shadowColor: colors.pink,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
