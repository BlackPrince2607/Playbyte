import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  responses?: number;
  onShare?: () => void;
  shareDisabled?: boolean;
  shareLoading?: boolean;
};

/**
 * Heart / Chat are decorative until likes & comments APIs ship.
 * Challenge is not aliased to Share — use Share only when that is the real action.
 */
export function ActionRail({
  onShare,
  shareDisabled,
  shareLoading,
}: Props) {
  const items = [
    { icon: "heart-outline" as const, label: "Soon", disabled: true },
    { icon: "chatbubble-outline" as const, label: "Soon", disabled: true },
    {
      icon: "share-outline" as const,
      label: shareLoading ? "…" : "Share",
      onPress: onShare,
      disabled: !onShare || shareDisabled || shareLoading,
    },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Pressable
          key={item.icon}
          style={[styles.item, item.disabled && styles.itemDisabled]}
          disabled={item.disabled}
          accessibilityState={{ disabled: Boolean(item.disabled) }}
          accessibilityLabel={item.label === "Soon" ? `${item.icon} coming soon` : item.label}
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
  itemDisabled: { opacity: 0.55 },
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
