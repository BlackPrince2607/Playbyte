import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

/** Stitch bottom nav: Feed · Compete · Friends · Vault */
export type TabKey = "feed" | "compete" | "friends" | "vault";

const TABS: {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOn: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "feed", label: "Feed", icon: "play-circle-outline", iconOn: "play-circle" },
  { key: "compete", label: "Compete", icon: "trophy-outline", iconOn: "trophy" },
  { key: "friends", label: "Friends", icon: "people-outline", iconOn: "people" },
  { key: "vault", label: "Vault", icon: "person-circle-outline", iconOn: "person-circle" },
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
            style={[styles.tab, on && styles.tabOn]}
          >
            <Ionicons name={on ? t.iconOn : t.icon} size={22} color={on ? colors.lime : colors.lilac} />
            <Text
              style={[
                type.micro,
                {
                  color: on ? colors.lime : colors.lilac,
                  fontFamily: on ? fonts.bodyBold : fonts.body,
                },
              ]}
            >
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
  tab: {
    alignItems: "center",
    gap: 4,
    minWidth: 64,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  tabOn: { backgroundColor: colors.cardAlt },
});
