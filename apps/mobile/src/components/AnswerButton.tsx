import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  label: string;
  percent?: number | null;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  emoji?: string;
};

export function AnswerButton({ label, percent, selected, disabled, onPress, emoji }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && { borderColor: colors.lime },
      ]}
    >
      {percent != null && percent > 0 ? (
        <View style={[styles.fill, { width: `${Math.min(100, percent)}%` }]} />
      ) : null}
      <View style={styles.row}>
        <Text style={[type.bodyLg, styles.label]}>
          {emoji ? `${emoji} ` : ""}
          {label}
        </Text>
        {percent != null ? <Text style={[type.stats, { color: colors.lime }]}>{percent}%</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.margin,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  selected: { borderColor: colors.lime, borderWidth: 2 },
  disabled: { opacity: 0.5 },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 77, 141, 0.15)",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: colors.paper, fontWeight: "700", flex: 1 },
});
