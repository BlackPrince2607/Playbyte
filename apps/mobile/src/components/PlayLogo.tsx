import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { fonts, type } from "../theme/typography";

export function PlayLogo({
  size = "md",
  soft = false,
}: {
  size?: "sm" | "md" | "lg";
  soft?: boolean;
}) {
  const fontSize = size === "lg" ? 36 : size === "sm" ? 18 : 22;
  return (
    <Text
      style={[
        type.logo,
        {
          fontSize,
          color: soft ? colors.pinkSoft : colors.pink,
          fontFamily: fonts.display,
        },
      ]}
      accessibilityRole="header"
    >
      PLAY
    </Text>
  );
}

export function LivePill({ count, label }: { count?: number; label?: string }) {
  return (
    <View style={styles.pill}>
      <View style={styles.dot} />
      <Text style={[type.statsSm, { color: colors.lime, fontSize: 10, letterSpacing: 0.8 }]}>
        {label ?? (count !== undefined ? `${count} PLAYING NOW` : "LIVE")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(198, 255, 61, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
});
