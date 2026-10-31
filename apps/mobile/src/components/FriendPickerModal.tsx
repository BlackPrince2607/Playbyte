import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Friend } from "../api";
import { useLanguage } from "../context/LanguageContext";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { AvatarImage } from "./AvatarImage";
import { PrimaryButton } from "./PrimaryButton";

type Props = {
  visible: boolean;
  friends: Friend[];
  title?: string;
  emptyHint?: string;
  busyUserId?: string | null;
  onSelect: (friend: Friend) => void;
  onClose: () => void;
  onSignIn?: () => void;
  signedIn: boolean;
};

export function FriendPickerModal({
  visible,
  friends,
  title,
  emptyHint,
  busyUserId,
  onSelect,
  onClose,
  onSignIn,
  signedIn,
}: Props) {
  const { t, fonts: ui } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("cancel")} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={[type.screenTitle, { color: colors.paper, fontFamily: ui.display, fontSize: 22 }]}>
          {title ?? t("challengeFriend")}
        </Text>
        {!signedIn ? (
          <View style={styles.empty}>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>{t("signInToChallenge")}</Text>
            {onSignIn ? (
              <PrimaryButton label={t("signIn")} onPress={onSignIn} style={{ marginTop: spacing.md, alignSelf: "stretch" }} />
            ) : null}
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>
              {emptyHint ?? t("challengeNeedFriends")}
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xs }}>
            {friends.map((f) => (
              <Pressable
                key={f.userId}
                onPress={() => onSelect(f)}
                disabled={busyUserId != null}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                accessibilityRole="button"
                accessibilityLabel={fillName(t("challengeNamed"), f.displayName)}
              >
                <AvatarImage displayName={f.displayName} avatarKey={f.avatarKey} size={40} />
                <Text style={[type.bodyLg, { color: colors.paper, fontFamily: ui.bodyBold, flex: 1 }]} numberOfLines={1}>
                  {f.displayName}
                </Text>
                <Text style={[type.micro, { color: colors.lime, fontFamily: ui.bodyBold }]}>
                  {busyUserId === f.userId ? t("sendingChallenge") : t("challenge")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <PrimaryButton label={t("cancel")} variant="secondary" onPress={onClose} style={{ marginTop: spacing.md }} />
      </View>
    </Modal>
  );
}

function fillName(template: string, name: string) {
  return template.replace("{name}", name);
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    marginTop: "auto",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.lg,
    maxHeight: "70%",
  },
  list: { marginTop: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  empty: { paddingVertical: spacing.xl, alignItems: "center", gap: spacing.sm },
});
