import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { prefersReducedMotion } from "../game/ui/feedback";
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
  /** Grid tile that stretches to its cell; the image keeps a real square size. */
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
  const scale = useSharedValue(1);
  const fillWidth = useSharedValue(0);
  const reduced = prefersReducedMotion();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    const target = percent != null && percent > 0 ? Math.min(100, percent) : selected || correct ? 100 : 0;
    fillWidth.value = reduced ? target : withTiming(target, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [percent, selected, correct, fillWidth, reduced]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
    backgroundColor: fillColor,
  }));

  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? undefined}
      disabled={disabled}
      style={tile ? styles.tilePressable : undefined}
      onPressIn={() => {
        if (disabled || reduced) return;
        scale.value = withTiming(0.97, { duration: 70 });
      }}
      onPressOut={() => {
        if (disabled || reduced) return;
        scale.value = withSpring(1, { damping: 14, stiffness: 280 });
      }}
      onPress={() => {
        if (disabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
    >
      <Animated.View
        style={[
          styles.btn,
          tile ? styles.tile : compact ? styles.compact : null,
          borderSelected && styles.selected,
          incorrect && styles.incorrect,
          pressStyle,
        ]}
      >
        {(percent != null && percent > 0) || selected || correct ? (
          <Animated.View style={[styles.fill, fillStyle]} />
        ) : null}
        {showImage ? (
          <Image
            source={{ uri: imageUrl! }}
            style={tile ? styles.tileImage : styles.image}
            resizeMode="contain"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <View style={styles.row}>
          <Text
            style={[tile ? type.bodyLg : type.button, styles.label, compact && styles.labelCompact, { fontFamily: fonts.bodyBold }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {emoji ? `${emoji} ` : ""}
            {label ?? ""}
          </Text>
          <View style={styles.trailing}>
            {showCheck || selected || correct ? <Text style={styles.check}>✓</Text> : null}
            {percent != null ? (
              <Text style={[type.statsSm, { color: colors.lime, fontFamily: fonts.mono }]}>
                {percent}%
              </Text>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tilePressable: { flex: 1 },
  btn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.margin,
    overflow: "hidden",
    marginBottom: spacing.sm,
    minHeight: 52,
    flexShrink: 0,
    justifyContent: "center",
  },
  compact: { paddingVertical: 12, minHeight: 48 },
  tile: {
    flex: 1,
    marginBottom: 0,
    padding: spacing.sm,
    justifyContent: "flex-start",
    minHeight: 140,
    flexShrink: 0,
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
    aspectRatio: 1,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.ink,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.xs },
  label: { color: colors.paper, flex: 1 },
  labelCompact: { fontSize: 15, lineHeight: 20 },
  trailing: { flexDirection: "row", alignItems: "center", gap: 6 },
  check: { color: colors.lime, fontSize: 18, fontWeight: "700" },
});
