import { type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloseButton } from "./CloseButton";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Extra style on the sheet panel (e.g. flex for KeyboardAvoidingView). */
  sheetStyle?: ViewStyle;
  /** When false, hide the X (handle + backdrop still dismiss). Default true. */
  showClose?: boolean;
};

export function BottomSheetShell({
  visible,
  onClose,
  title,
  children,
  sheetStyle,
  showClose = true,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }, sheetStyle]}>
        <View style={styles.handle} />
        {(title || showClose) && (
          <View style={styles.header}>
            {title ? <Text style={[type.screenTitle, styles.title]}>{title}</Text> : <View style={{ flex: 1 }} />}
            {showClose ? <CloseButton onPress={onClose} /> : null}
          </View>
        )}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    color: colors.paper,
    fontSize: 22,
  },
});
