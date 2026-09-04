import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PlayLogo } from "../../components/PlayLogo";
import { colors, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = { onNext: () => void };

export function WelcomeScreen({ onNext }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={[colors.ink, "#2a1040", colors.ink]} style={styles.wrap}>
      <View style={[styles.inner, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <PlayLogo size="lg" />
        <Text style={[type.hero, styles.title]}>Every swipe is a play.</Text>
        <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.md }]}>
          Join live moments and mini-games — see how you fit into the crowd.
        </Text>
        <View style={{ flex: 1 }} />
        <PrimaryButton label="Get started" onPress={onNext} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: spacing.margin },
  title: { color: colors.paper, marginTop: spacing.xl },
});
