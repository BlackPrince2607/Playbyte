import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, type ViewStyle } from "react-native";
import { useLanguage } from "../context/LanguageContext";
import { colors } from "../theme/colors";

type Props = {
  onPress: () => void;
  color?: string;
  size?: number;
  style?: ViewStyle;
};

export function CloseButton({ onPress, color = colors.lilac, size = 22, style }: Props) {
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t("close")}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, style]}
    >
      <Ionicons name="close" size={size} color={color} />
    </Pressable>
  );
}
