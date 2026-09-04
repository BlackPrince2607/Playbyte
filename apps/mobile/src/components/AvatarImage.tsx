import { useState } from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";
import { avatarPublicUrl, initialsFor } from "../lib/avatars";
import { colors } from "../theme/colors";
import { type } from "../theme/typography";

type Props = {
  displayName: string;
  avatarKey?: string | null;
  size?: number;
  style?: ViewStyle;
};

export function AvatarImage({ displayName, avatarKey, size = 44, style }: Props) {
  const [failed, setFailed] = useState(false);
  const uri = avatarPublicUrl(avatarKey);
  const showImage = Boolean(uri) && !failed;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityLabel={`${displayName} avatar`}
        />
      ) : (
        <Text style={[type.bodySm, { color: colors.pink, fontSize: Math.max(12, size * 0.35) }]}>
          {initialsFor(displayName)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
