import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { useLanguage } from "../context/LanguageContext";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  onPress: () => void;
  /** Show the text label from `t("back")`. Default true. */
  withLabel?: boolean;
  style?: ViewStyle;
};

export function BackLink({ onPress, withLabel = true, style }: Props) {
  const { t, fonts: ui } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t("goBack")}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }, style]}
    >
      <Ionicons name="arrow-back" size={20} color={colors.pinkSoft} />
      {withLabel ? (
        <Text style={[type.bodySm, styles.label, { fontFamily: ui.body }]}>{t("back")}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
  },
  label: {
    color: colors.pinkSoft,
  },
});
