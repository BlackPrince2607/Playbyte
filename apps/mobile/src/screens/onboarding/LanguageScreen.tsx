import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { setLanguage } from "../../lib/storage";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

const LANGS = [
  { id: "en", glyph: "A", label: "English" },
  { id: "hinglish", glyph: "A/अ", label: "Hinglish" },
  { id: "hi", glyph: "अ", label: "हिन्दी" },
  { id: "bn", glyph: "অ", label: "বাংলা" },
  { id: "ta", glyph: "அ", label: "தமிழ்" },
  { id: "te", glyph: "అ", label: "తెలుగు" },
  { id: "kn", glyph: "ಅ", label: "ಕನ್ನಡ" },
  { id: "mr", glyph: "अ", label: "मराठी" },
];

type Props = { onNext: () => void; onSkip: () => void; onBack?: () => void };

export function LanguageScreen({ onNext, onSkip, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState("en");

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ marginBottom: spacing.md, alignSelf: "flex-start" }}
        >
          <Text style={[type.bodySm, { color: colors.lilac }]}>← Back</Text>
        </Pressable>
      ) : null}
      <Text style={[type.hero, { color: colors.paper }]}>Play in your language.</Text>
      <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>
        Choose the language that feels most natural to you.
      </Text>
      <Text style={[type.metadata, { color: colors.lilac, marginTop: spacing.xs }]}>
        Preference is saved on this device. Full localization is coming soon — the app UI stays in English for now.
      </Text>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {LANGS.map((l) => {
          const on = selected === l.id;
          return (
            <Pressable
              key={l.id}
              style={[styles.tile, on && styles.tileOn]}
              onPress={() => setSelected(l.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              {on ? <Text style={styles.check}>✓</Text> : null}
              <Text
                style={[
                  type.hero,
                  {
                    color: on ? colors.pink : colors.paper,
                    fontSize: 32,
                    marginBottom: spacing.xs,
                  },
                ]}
              >
                {l.glyph}
              </Text>
              <Text style={[type.bodySm, { color: colors.lilac, fontFamily: fonts.bodyBold }]}>
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <PrimaryButton
        label="Continue"
        trailingIcon="arrow-forward"
        onPress={() => {
          void setLanguage(selected);
          onNext();
        }}
      />
      <PrimaryButton label="Skip for now" variant="secondary" onPress={onSkip} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.margin },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: spacing.lg,
    paddingBottom: spacing.md,
  },
  tile: {
    width: "47%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  tileOn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
    borderColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  check: {
    position: "absolute",
    top: 8,
    right: 10,
    color: colors.lime,
    fontSize: 16,
    fontWeight: "700",
  },
});
