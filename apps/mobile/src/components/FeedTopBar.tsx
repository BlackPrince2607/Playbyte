import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "./AvatarImage";
import { MajaLogo } from "./MajaLogo";
import { useApp } from "../context/AppContext";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  streak?: number;
  variant?: "feed" | "compete";
  onStreak?: () => void;
  onMenu?: () => void;
  onProfile?: () => void;
  avatarDisplayName?: string;
  avatarKey?: string | null;
};

export function FeedTopBar({
  streak = 0,
  variant = "feed",
  onStreak,
  onMenu,
  onProfile,
  avatarDisplayName,
  avatarKey,
}: Props) {
  const insets = useSafeAreaInsets();
  const { me } = useApp();
  const name = avatarDisplayName ?? me?.displayName ?? "You";
  const photo = avatarKey ?? me?.avatarKey ?? null;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.inner}>
        {variant === "compete" ? (
          <Pressable onPress={onMenu} hitSlop={12} accessibilityRole="button">
            <Ionicons name="menu" size={24} color={colors.pinkSoft} />
          </Pressable>
        ) : (
          <Pressable onPress={onProfile} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open profile">
            <AvatarImage displayName={name} avatarKey={photo} size={40} />
          </Pressable>
        )}
        <MajaLogo />
        {variant === "feed" ? (
          <Pressable
            style={({ pressed }) => [styles.streak, pressed && { opacity: 0.7 }]}
            onPress={onStreak}
            disabled={!onStreak}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Streak ${streak}. Open streak details`}
          >
            <Text style={[type.statsSm, { color: colors.pink }]}>{streak}</Text>
            <Text style={{ fontSize: 14 }}>🔥</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onProfile} hitSlop={8} accessibilityRole="button">
            <AvatarImage displayName={name} avatarKey={photo} size={32} />
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
    backgroundColor: "transparent",
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
