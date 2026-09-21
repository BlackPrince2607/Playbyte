import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, spacing } from "../theme/colors";
import { fonts } from "../theme/typography";

type Props = {
  label: string;
  onPress: () => void;
  success?: boolean;
  disabled?: boolean;
  style?: object;
};

export function GameBtn({ label, onPress, success, disabled, style }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        disabled={disabled}
        onPress={() => {
          scale.value = withSequence(withTiming(0.94, { duration: 60 }), withSpring(1));
          onPress();
        }}
        accessibilityRole="button"
        style={{
          backgroundColor: success ? colors.lime : colors.cardAlt,
          padding: spacing.md,
          borderRadius: radius.md,
          minWidth: 100,
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.line,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ color: success ? colors.ink : colors.paper, fontFamily: fonts.bodyBold }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
