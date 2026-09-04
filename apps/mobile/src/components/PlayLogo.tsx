import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { type } from "../theme/typography";

export function PlayLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const fontSize = size === "lg" ? 36 : size === "sm" ? 18 : 22;
  return (
    <Text style={[type.logo, { fontSize, color: colors.pinkSoft }]} accessibilityRole="header">
      PLAY
    </Text>
  );
}

export function LivePill({ count, label }: { count?: number; label?: string }) {
  return (
    <View style={styles.pill}>
      <View style={styles.dot} />
      <Text style={[type.stats, { color: colors.paper }]}>
        {label ?? (count !== undefined ? `${count} playing now` : "LIVE")}
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
    backgroundColor: colors.limeLive,
  },
});
