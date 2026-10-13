import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { type } from "../theme/typography";

const WORDMARK = require("../../assets/maja-wordmark.png");
/** Width / height of the wordmark artwork. */
const WORDMARK_RATIO = 480 / 215;
const HEIGHTS = { sm: 22, md: 30, lg: 48 } as const;

/** The light wordmark, drawn for the app's dark surfaces. */
export function MajaLogo({ size = "md" }: { size?: keyof typeof HEIGHTS }) {
  const height = HEIGHTS[size];
  return (
    <Image
      source={WORDMARK}
      style={{ height, width: height * WORDMARK_RATIO }}
      resizeMode="contain"
      accessibilityRole="header"
      accessibilityLabel="Maja"
    />
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
