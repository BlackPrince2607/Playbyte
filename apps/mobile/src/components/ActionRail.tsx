import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatCount } from "../api";
import { shareAppInvite } from "../lib/shareInvite";
import { colors, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  likes: number;
  liked: boolean;
  onToggleLike: () => void;
  comments: number;
  onComments: () => void;
  shares: number;
  onShare?: () => void;
  shareDisabled?: boolean;
  shareLoading?: boolean;
};

type Item = {
  key: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  label: string;
  a11y: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
};

/** Invite shares the app itself; Share shares this moment's card. */
export function ActionRail({
  likes,
  liked,
  onToggleLike,
  comments,
  onComments,
  shares,
  onShare,
  shareDisabled,
  shareLoading,
}: Props) {
  const items: Item[] = [
    {
      key: "like",
      icon: liked ? "heart" : "heart-outline",
      iconColor: liked ? colors.pink : colors.paper,
      label: formatCount(likes),
      a11y: `${liked ? "Unlike" : "Like"}, ${likes} likes`,
      onPress: onToggleLike,
      selected: liked,
    },
    {
      key: "comment",
      icon: "chatbubble-outline",
      label: comments > 0 ? formatCount(comments) : "Comment",
      a11y: `Comments, ${comments}`,
      onPress: onComments,
    },
    {
      key: "share",
      icon: "share-outline",
      label: formatCount(shares),
      a11y: `Share, ${shares} shares`,
      onPress: onShare,
      disabled: !onShare || shareDisabled || shareLoading,
      loading: shareLoading,
    },
    {
      key: "invite",
      icon: "person-add-outline",
      label: "Invite",
      a11y: "Invite friends",
      onPress: () => void shareAppInvite(),
    },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          style={[styles.item, item.disabled && !item.loading && styles.itemDisabled]}
          disabled={item.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(item.disabled), selected: item.selected }}
          accessibilityLabel={item.a11y}
          hitSlop={6}
          onPress={() => {
            void Haptics.selectionAsync();
            item.onPress?.();
          }}
        >
          <View style={[styles.circle, item.selected && styles.circleSelected]}>
            {item.loading ? (
              <ActivityIndicator color={colors.paper} size="small" />
            ) : (
              <Ionicons name={item.icon} size={20} color={item.iconColor ?? colors.paper} />
            )}
          </View>
          <Text style={[type.micro, { color: colors.lilac, fontFamily: fonts.bodyMedium }]}>{item.label}</Text>
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
  circleSelected: { borderColor: colors.pink, backgroundColor: colors.pinkFill },
});
