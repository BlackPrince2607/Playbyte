import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { playerIdShareMessage, shortPlayerId } from "../lib/playerId";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";
import { AvatarImage } from "./AvatarImage";

type Props = {
  id: string;
  displayName: string;
  avatarKey?: string | null;
  bio?: string | null;
  caption?: string;
};

export function PlayerIdCard({ id, displayName, avatarKey, bio, caption }: Props) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    await Clipboard.setStringAsync(id);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    try {
      await Share.share({ message: playerIdShareMessage(id) });
    } catch {
      /* cancelled */
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AvatarImage displayName={displayName} avatarKey={avatarKey} size={56} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[type.metadata, { color: colors.lilac, fontFamily: fonts.mono }]}>{shortPlayerId(id)}</Text>
        </View>
      </View>
      {bio ? (
        <Text style={[type.bodySm, { color: colors.paper, opacity: 0.85 }]} numberOfLines={3}>
          {bio}
        </Text>
      ) : null}

      <View style={styles.idBox}>
        <Text style={[type.micro, styles.label]}>PLAYER ID</Text>
        <Text selectable style={styles.id}>
          {id}
        </Text>
      </View>
      {caption ? <Text style={[type.metadata, { color: colors.lilac }]}>{caption}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy player ID"
          onPress={() => void copy()}
          style={({ pressed }) => [styles.action, copied && styles.actionDone, pressed && styles.pressed]}
        >
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={copied ? colors.ink : colors.paper} />
          <Text style={[styles.actionText, copied && { color: colors.ink }]}>{copied ? "Copied" : "Copy ID"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share player ID"
          onPress={() => void share()}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="share-social-outline" size={16} color={colors.paper} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.pinkGlow,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { borderWidth: 2, borderColor: colors.pink },
  name: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.paper },
  idBox: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 6,
  },
  label: { color: colors.lilac, letterSpacing: 1.2 },
  id: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, color: colors.lime },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionDone: { backgroundColor: colors.lime, borderColor: colors.lime },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.paper },
});
