import { Image, type ImageStyle, type StyleProp } from "react-native";

const COIN = require("../../assets/coin.png");

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/** Glossy Maja coin mark used for wallet balance and earn toasts. */
export function CoinIcon({ size = 16, style }: Props) {
  return (
    <Image
      source={COIN}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
