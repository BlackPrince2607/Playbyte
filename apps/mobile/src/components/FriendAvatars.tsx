import { Image, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { avatarPublicUrl, initialsFor } from "../lib/avatars";
import { colors } from "../theme/colors";
import { type } from "../theme/typography";

type Friend = { displayName: string; avatarKey?: string | null };

function MiniAvatar({ friend, index }: { friend: Friend; index: number }) {
  const [failed, setFailed] = useState(false);
  const uri = avatarPublicUrl(friend.avatarKey);
  const showImage = Boolean(uri) && !failed;

  return (
    <View
      style={[
        styles.avatar,
        { marginLeft: index === 0 ? 0 : -10, zIndex: 10 - index },
        !showImage && styles.initialsBg,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={styles.avatarImg}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[type.micro, { color: colors.pink, fontSize: 10 }]}>
          {initialsFor(friend.displayName).slice(0, 1)}
        </Text>
      )}
    </View>
  );
}

export function FriendAvatars({
  friends,
  extraCount,
}: {
  friends: Friend[];
  extraCount?: number;
}) {
  const shown = friends.slice(0, 2);
  return (
    <View style={styles.row}>
      <View style={styles.stack}>
        {shown.map((f, i) => (
          <MiniAvatar key={`${f.displayName}-${i}`} friend={f} index={i} />
        ))}
        {extraCount !== undefined && extraCount > 0 ? (
          <View style={[styles.avatar, styles.more, { marginLeft: shown.length ? -10 : 0 }]}>
            <Text style={[type.micro, { color: colors.lime }]}>+{extraCount}</Text>
          </View>
        ) : null}
      </View>
      {friends.length > 0 ? (
        <Text style={[type.bodySm, { color: colors.paper, flex: 1 }]} numberOfLines={2}>
          <Text style={{ fontWeight: "700" }}>{friends.map((f) => f.displayName).join(", ")}</Text>
          {extraCount ? ` + ${extraCount} people are playing` : " are playing"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  stack: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  initialsBg: { backgroundColor: colors.cardAlt },
  more: {
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
});
