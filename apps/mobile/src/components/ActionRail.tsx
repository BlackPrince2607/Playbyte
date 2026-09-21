import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatCount } from "../api";
import { colors, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  responses?: number;
  onShare?: () => void;
  onChallenge?: () => void;
  shareDisabled?: boolean;
  shareLoading?: boolean;
};

export function ActionRail({
  responses = 0,
  onShare,
  onChallenge,
  shareDisabled,
  shareLoading,
}: Props) {
  const derivedBuzz = Math.max(0, Math.floor(responses / 15));
  const challenge = onChallenge ?? onShare;

  const items = [
    { icon: "heart" as const, label: formatCount(responses), disabled: true },
    { icon: "chatbubble" as const, label: formatCount(derivedBuzz), disabled: true },
    {
      icon: "share-outline" as const,
      label: shareLoading ? "…" : "Share",
      onPress: onShare,
      disabled: shareDisabled || shareLoading,
    },
    {
      icon: "flash" as const,
      label: "Challenge",
      onPress: challenge,
      disabled: !challenge || shareDisabled || shareLoading,
    },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Pressable
          key={item.label + item.icon}
          style={[styles.item, item.disabled && styles.itemDisabled]}
          disabled={item.disabled}
          onPress={() => {
            if (item.disabled) return;
            void Haptics.selectionAsync();
            item.onPress?.();
          }}
        >
          <View style={styles.circle}>
            {item.label === "…" ? (
              <ActivityIndicator color={colors.paper} size="small" />
            ) : (
              <Ionicons name={item.icon} size={20} color={colors.paper} />
            )}
          </View>
          <Text style={[type.micro, { color: colors.lilac, fontFamily: fonts.bodyMedium }]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: "rgba(21, 14, 43, 0.4)",
  },
  item: { alignItems: "center", gap: 4, minWidth: 56 },
  itemDisabled: { opacity: 0.85 },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
});
