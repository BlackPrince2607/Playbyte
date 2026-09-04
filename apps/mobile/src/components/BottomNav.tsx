import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/colors";
import { type } from "../theme/typography";

export type TabKey = "feed" | "live" | "friends" | "profile";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "feed", label: "Feed", icon: "play-circle" },
  { key: "live", label: "Live", icon: "radio" },
  { key: "friends", label: "Friends", icon: "people" },
  { key: "profile", label: "You", icon: "person-circle" },
];

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

export function BottomNav({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={styles.tab}
          >
            <Ionicons name={t.icon} size={22} color={on ? colors.lime : colors.lilac} />
            <Text style={[type.micro, { color: on ? colors.lime : colors.lilac, textTransform: "capitalize" }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: "rgba(21, 14, 43, 0.95)",
    paddingTop: spacing.sm,
  },
  tab: { alignItems: "center", gap: 4, minWidth: 64 },
});
