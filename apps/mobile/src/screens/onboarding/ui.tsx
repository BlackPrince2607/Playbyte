import Ionicons from "@expo/vector-icons/Ionicons";
import { Canvas, Group, Path } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, type ColorValue, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useLanguage } from "../../context/LanguageContext";
import { colors, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

export function BackButton({ onPress, plain = false }: { onPress: () => void; plain?: boolean }) {
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("goBack")}
      style={({ pressed }) => [plain ? styles.backPlain : styles.backCircle, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Ionicons name="arrow-back" size={plain ? 24 : 20} color={colors.paper} />
    </Pressable>
  );
}

export function CtaButton({
  label,
  onPress,
  disabled,
  icon = "arrow-forward",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap | null;
  style?: ViewStyle;
}) {
  const { fonts: ui } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.cta,
        disabled && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <Text style={[styles.ctaLabel, { fontFamily: ui.bodyBold }]}>{label}</Text>
      {icon ? <Ionicons name={icon} size={20} color={colors.paper} /> : null}
    </Pressable>
  );
}

export function PageDots({ count, active }: { count: number; active: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Page ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={i === active ? styles.dotActive : styles.dot} />
      ))}
    </View>
  );
}

/** Soft radial light, standing in for the CSS blur glows in the designs. */
export function Glow({ color, size, style }: { color: string; size: number; style?: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          experimental_backgroundImage: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        },
        style,
      ]}
    />
  );
}

export function useFloat(duration: number, distance = 8) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [duration, t]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: t.value * distance }] }));
}

export function usePulse(duration = 1200) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [duration, t]);
  return useAnimatedStyle(() => ({ opacity: 1 - t.value * 0.6 }));
}

export function PulseDot({ size, color, style }: { size: number; color: ColorValue; style?: ViewStyle }) {
  const pulse = usePulse();
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, pulse, style]}
    />
  );
}

/** Pink rotated tile with a game controller — the MAJA "play" mark. */
export function BrandDiamond({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.diamondShadow, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <LinearGradient
        colors={["#ec4899", "#e11d48"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.diamond, { borderRadius: size * 0.28 }]}
      >
        <Ionicons
          name="game-controller"
          size={size / 2}
          color="#fff"
          style={{ transform: [{ rotate: "-45deg" }] }}
        />
      </LinearGradient>
    </View>
  );
}

const GOOGLE_PATHS = [
  {
    d: "M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z",
    color: "#4285F4",
  },
  {
    d: "M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.4 7.33 24 12 24z",
    color: "#34A853",
  },
  {
    d: "M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.94 0 12s.45 3.84 1.24 5.42l4.04-3.15z",
    color: "#FBBC05",
  },
  {
    d: "M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.6 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z",
    color: "#EA4335",
  },
];

export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: size / 24 }]}>
        {GOOGLE_PATHS.map((p) => (
          <Path key={p.color} path={p.d} color={p.color} />
        ))}
      </Group>
    </Canvas>
  );
}

export const onboardingStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.base, overflow: "hidden" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  accent: {
    color: colors.pink,
    textShadowColor: "rgba(255,77,141,0.45)",
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 2 },
  },
  stepLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 2,
    color: colors.lilac,
    textTransform: "uppercase",
    textAlign: "center",
  },
  /** One title size for every onboarding screen. */
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: colors.paper,
  },
  lede: {
    ...type.bodySm,
    color: surface.onSurfaceVariant,
    marginTop: 6,
  },
});

const styles = StyleSheet.create({
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  backPlain: {
    width: 44,
    height: 44,
    marginLeft: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.pink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 8px 28px -4px rgba(255,77,141,0.45)",
  },
  ctaLabel: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.paper },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  dotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.pink,
    boxShadow: "0 0 10px rgba(255,77,141,0.8)",
  },
  diamondShadow: {
    transform: [{ rotate: "45deg" }],
    boxShadow: "0 0 30px -4px rgba(255,77,141,0.6)",
  },
  diamond: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
