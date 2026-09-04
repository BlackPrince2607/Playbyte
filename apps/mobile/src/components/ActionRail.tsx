import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatCount } from "../api";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  /** Crowd response count — shown as a derived engagement indicator, not backend likes. */
  responses?: number;
  onShare?: () => void;
  shareDisabled?: boolean;
  shareLoading?: boolean;
};

export function ActionRail({ responses = 0, onShare, shareDisabled, shareLoading }: Props) {
  const derivedBuzz = Math.max(0, Math.floor(responses / 15));
  const items = [
    { icon: "heart" as const, label: formatCount(responses), sublabel: "responses", disabled: true },
    { icon: "chatbubble" as const, label: formatCount(derivedBuzz), sublabel: "buzz", disabled: true },
    {
      icon: "share-outline" as const,
      label: shareLoading ? "…" : "Share",
      sublabel: undefined,
      onPress: onShare,
      disabled: shareDisabled || shareLoading,
    },
    { icon: "flash-outline" as const, label: "Soon", sublabel: undefined, disabled: true },
  ];
  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Pressable
          key={item.label + (item.sublabel ?? "")}
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
          <Text style={[type.micro, { color: item.onPress ? colors.lilac : colors.paper }]}>
            {item.label}
          </Text>
          {item.sublabel ? (
            <Text style={[type.micro, { color: colors.lilac, fontSize: 9 }]}>{item.sublabel}</Text>
          ) : null}
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
  item: { alignItems: "center", gap: 2 },
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
