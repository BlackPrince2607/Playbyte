import * as Haptics from "expo-haptics";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  label?: string | null;
  imageUrl?: string | null;
  percent?: number | null;
  selected?: boolean;
  correct?: boolean;
  incorrect?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  emoji?: string;
  showCheck?: boolean;
};

export function AnswerButton({
  label,
  imageUrl,
  percent,
  selected,
  correct,
  incorrect,
  disabled,
  onPress,
  emoji,
  showCheck,
}: Props) {
  const fillColor = selected || correct ? colors.limeFill : colors.pinkFill;
  const borderSelected = selected || correct;

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
        borderSelected && styles.selected,
        incorrect && styles.incorrect,
        pressed && !disabled && { borderColor: colors.lime },
      ]}
    >
      {percent != null && percent > 0 ? (
        <View style={[styles.fill, { width: `${Math.min(100, percent)}%`, backgroundColor: fillColor }]} />
      ) : selected || correct ? (
        <View style={[styles.fill, { width: "100%", backgroundColor: colors.limeFill }]} />
      ) : null}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.row}>
        <Text style={[type.bodyLg, styles.label, { fontFamily: fonts.bodyBold }]}>
          {emoji ? `${emoji} ` : ""}
          {label ?? ""}
        </Text>
        <View style={styles.trailing}>
          {showCheck || selected || correct ? (
            <Text style={styles.check}>✓</Text>
          ) : null}
          {percent != null ? (
            <Text style={[type.statsSm, { color: colors.lime }]}>{percent}%</Text>
          ) : null}
        </View>
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
  incorrect: { borderColor: colors.pink, borderWidth: 2 },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  image: {
    width: "100%",
    height: 120,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: colors.paper, flex: 1 },
  trailing: { flexDirection: "row", alignItems: "center", gap: 8 },
  check: { color: colors.lime, fontSize: 18, fontWeight: "700" },
});
