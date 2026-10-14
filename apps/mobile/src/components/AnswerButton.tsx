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
  /** Grid tile that stretches to its cell; the image shrinks to fit instead of overflowing the card. */
  tile?: boolean;
  /** Tighter padding when many text answers share the card. */
  compact?: boolean;
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
  tile,
  compact,
}: Props) {
  const fillColor = selected || correct ? colors.limeFill : colors.pinkFill;
  const borderSelected = selected || correct;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? undefined}
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        tile ? styles.tile : compact ? styles.compact : null,
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
        <Image source={{ uri: imageUrl }} style={tile ? styles.tileImage : styles.image} resizeMode="contain" />
      ) : null}
      <View style={styles.row}>
        <Text
          style={[tile ? type.bodySm : type.bodyLg, styles.label, { fontFamily: fonts.bodyBold }]}
          numberOfLines={tile ? 1 : 2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {emoji ? `${emoji} ` : ""}
          {label ?? ""}
        </Text>
        <View style={styles.trailing}>
          {showCheck || selected || correct ? <Text style={styles.check}>✓</Text> : null}
          {percent != null ? (
            <Text style={[tile ? type.metadata : type.statsSm, { color: colors.lime, fontFamily: fonts.mono }]}>
              {percent}%
            </Text>
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
    minHeight: 44,
    flexShrink: 1,
    justifyContent: "center",
  },
  compact: { paddingVertical: 10 },
  tile: {
    flex: 1,
    marginBottom: 0,
    padding: spacing.sm,
    justifyContent: "flex-start",
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
    backgroundColor: colors.ink,
  },
  tileImage: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.ink,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.xs },
  label: { color: colors.paper, flex: 1 },
  trailing: { flexDirection: "row", alignItems: "center", gap: 6 },
  check: { color: colors.lime, fontSize: 18, fontWeight: "700" },
});
