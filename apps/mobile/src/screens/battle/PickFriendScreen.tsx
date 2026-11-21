import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Friend } from "../../api";
import { AvatarImage } from "../../components/AvatarImage";
import { CloseButton } from "../../components/CloseButton";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useLanguage } from "../../context/LanguageContext";
import { prefersReducedMotion } from "../../game/ui/feedback";
import { fill } from "../../i18n/strings";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  friends: Friend[];
  onClose: () => void;
  onSelect: (friend: Friend) => void;
  onAddFriends?: () => void;
  onProfile?: () => void;
};

export function PickFriendScreen({ friends, onClose, onSelect, onAddFriends, onProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const reduced = prefersReducedMotion();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} color={colors.paper} style={styles.close} />
        <Text style={[type.bodyLg, styles.headerTitle]} numberOfLines={1}>
          Challenge Friend
        </Text>
        <Pressable accessibilityRole="button" onPress={onProfile} style={styles.avatarBtn}>
          <Ionicons name="person" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Pick a friend</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: -8 }]}>
          Same flow as random — choose a category next, then duel
        </Text>

        {friends.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={28} color={colors.lilac} />
            </View>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold, textAlign: "center" }]}>
              {t("noFriends")}
            </Text>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
              {t("challengeNeedFriends")}
            </Text>
            {onAddFriends ? (
              <PrimaryButton
                label={t("inviteFriends")}
                icon="person-add-outline"
                onPress={onAddFriends}
                style={{ alignSelf: "stretch", marginTop: spacing.sm }}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {friends.map((f, i) => (
              <Animated.View
                key={f.userId}
                entering={reduced ? undefined : FadeInDown.delay(i * 40).duration(240)}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={fill(t("challengeNamed"), { name: f.displayName })}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onSelect(f);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowDivider,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <AvatarImage displayName={f.displayName} avatarKey={f.avatarKey} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]} numberOfLines={1}>
                      {f.displayName}
                    </Text>
                    <Text style={[type.metadata, { color: colors.lilac }]}>Tap to challenge</Text>
                  </View>
                  <View style={styles.flash}>
                    <Ionicons name="flash" size={18} color={colors.ink} />
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
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
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  list: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  flash: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: surface.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
});
