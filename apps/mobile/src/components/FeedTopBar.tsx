import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "./AvatarImage";
import { PlayLogo } from "./PlayLogo";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  streak?: number;
  variant?: "feed" | "live";
  refreshing?: boolean;
  onRefresh?: () => void;
  onMenu?: () => void;
  onProfile?: () => void;
  avatarDisplayName?: string;
  avatarKey?: string | null;
};

export function FeedTopBar({
  streak = 0,
  variant = "feed",
  refreshing,
  onRefresh,
  onMenu,
  onProfile,
  avatarDisplayName = "You",
  avatarKey,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.inner}>
        {variant === "live" ? (
          <Pressable onPress={onMenu} hitSlop={12} accessibilityRole="button">
            <Ionicons name="menu" size={24} color={colors.pinkSoft} />
          </Pressable>
        ) : (
          <AvatarImage displayName={avatarDisplayName} avatarKey={avatarKey} size={40} />
        )}
        <PlayLogo />
        {variant === "feed" ? (
          <Pressable
            style={styles.streak}
            onPress={onRefresh}
            disabled={refreshing || !onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh feed"
          >
            <Text style={[type.stats, { color: colors.paper }]}>{streak}</Text>
            <Text style={{ fontSize: 14 }}>{refreshing ? "…" : "🔥"}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onProfile} hitSlop={8} accessibilityRole="button">
            <AvatarImage displayName={avatarDisplayName} avatarKey={avatarKey} size={32} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.md,
    backgroundColor: "rgba(21, 14, 43, 0.85)",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
