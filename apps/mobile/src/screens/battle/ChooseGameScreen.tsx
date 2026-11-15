import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloseButton } from "../../components/CloseButton";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BATTLE_CATEGORIES, type BattleCategory, type BattleCategoryId } from "./categories";

type Props = {
  onClose: () => void;
  onContinue: (category: BattleCategory) => void;
  onProfile?: () => void;
};

export function ChooseGameScreen({ onClose, onContinue, onProfile }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<BattleCategoryId>("mixed");
  const active = BATTLE_CATEGORIES.find((c) => c.id === selected) ?? BATTLE_CATEGORIES[0];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} color={colors.paper} style={styles.close} />
        <Text style={[type.bodyLg, styles.headerTitle]} numberOfLines={1}>
          Choose Game
        </Text>
        <Pressable accessibilityRole="button" onPress={onProfile} style={styles.avatarBtn}>
          <Ionicons name="person" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Choose a game</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: -8 }]}>
          Pick a theme for your 1v1 battle
        </Text>
        <View style={styles.grid}>
          {BATTLE_CATEGORIES.map((cat, index) => {
            const on = cat.id === selected;
            return (
              <Animated.View
                key={cat.id}
                entering={FadeInDown.delay(index * 40).duration(280)}
                style={styles.tileWrap}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSelected(cat.id);
                  }}
                  style={({ pressed }) => [
                    styles.tile,
                    on ? styles.tileOn : styles.tileOff,
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}
                >
                  {on ? (
                    <View style={styles.check}>
                      <Ionicons name="checkmark" size={14} color={colors.ink} />
                    </View>
                  ) : null}
                  <View style={[styles.iconWrap, { backgroundColor: cat.tint }]}>
                    <Ionicons name={cat.icon} size={32} color={cat.accent} />
                  </View>
                  <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.display }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onContinue(active);
          }}
          style={({ pressed }) => [styles.continue, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
        >
          <Text style={[type.button, { color: colors.paper, letterSpacing: 1 }]}>CONTINUE</Text>
          <Text style={styles.continueSub}>{active.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    height: 64,
    paddingHorizontal: spacing.margin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.paper,
    fontFamily: fonts.display,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: spacing.margin,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.gutter,
  },
  tileWrap: { width: "47%" },
  tile: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  tileOn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
    borderColor: surface.lime,
    shadowColor: surface.lime,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  tileOff: {
    backgroundColor: surface.low,
    borderWidth: 2,
    borderColor: "transparent",
  },
  check: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: surface.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    backgroundColor: "rgba(21,14,43,0.94)",
  },
  continue: {
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    shadowColor: colors.pink,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  continueSub: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "rgba(245,240,255,0.75)",
    letterSpacing: 0.8,
    marginTop: 1,
  },
});
