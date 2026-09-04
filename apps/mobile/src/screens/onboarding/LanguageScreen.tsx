import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PlayLogo } from "../../components/PlayLogo";
import { setLanguage } from "../../lib/storage";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

const LANGS = [
  { id: "en", label: "English", sub: "Default" },
  { id: "hi", label: "हिन्दी", sub: "Hindi" },
  { id: "ta", label: "தமிழ்", sub: "Tamil" },
  { id: "te", label: "తెలుగు", sub: "Telugu" },
];

type Props = { onNext: () => void; onSkip: () => void };

export function LanguageScreen({ onNext, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <PlayLogo />
      <Text style={[type.screenTitle, { color: colors.paper, marginTop: spacing.lg }]}>Choose your language</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>You can change this anytime.</Text>
      <ScrollView style={{ marginTop: spacing.lg }} contentContainerStyle={{ gap: spacing.sm }}>
        {LANGS.map((l) => (
          <Pressable
            key={l.id}
            style={styles.row}
            onPress={() => {
              void setLanguage(l.id);
              onNext();
            }}
          >
            <View>
              <Text style={[type.bodyLg, { color: colors.paper, fontWeight: "700" }]}>{l.label}</Text>
              <Text style={[type.metadata, { color: colors.lilac }]}>{l.sub}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <PrimaryButton label="Skip" variant="secondary" onPress={onSkip} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.margin },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
});
