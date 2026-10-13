import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_LANGUAGES, UPCOMING_LANGUAGES, supportedLanguage } from "../../lib/languages";
import { MajaLogo } from "../../components/MajaLogo";
import { getLanguage, setLanguage } from "../../lib/storage";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BackButton, CtaButton, Glow, PulseDot, onboardingStyles } from "./ui";

type Props = { onNext: () => void; onBack?: () => void };

export function LanguageScreen({ onNext, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState("en");

  useEffect(() => {
    void getLanguage().then((l) => setSelected(supportedLanguage(l)));
  }, []);

  return (
    <View style={onboardingStyles.root}>
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <View style={{ marginBottom: spacing.sm }}>
            <BackButton onPress={onBack} />
          </View>
        ) : null}

        <View style={styles.hero}>
          <Glow color="rgba(255,77,141,0.22)" size={200} style={{ right: -70, bottom: -80 }} />
          <PulseDot size={6} color={surface.lime} />
          <Text style={[styles.title, { marginTop: spacing.xs }]}>
            Play in your <Text style={onboardingStyles.accent}>language.</Text>
          </Text>
          <Text style={[type.bodySm, { color: surface.onSurfaceVariant, marginTop: spacing.xs }]}>
            Pick how you want to experience Maja. Tailored trivia, live vernacular rooms, and memes tuned to your vibe.
          </Text>
        </View>

        <View accessibilityRole="radiogroup" accessibilityLabel="Select your app language" style={styles.options}>
          {APP_LANGUAGES.map((l, i) => {
            const on = selected === l.id;
            return (
              <Pressable
                key={l.id}
                onPress={() => setSelected(l.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [
                  styles.option,
                  on && styles.optionOn,
                  pressed && { transform: [{ scale: 0.99 }] },
                ]}
              >
                <View style={[styles.badge, on && { backgroundColor: surface.lime }]}>
                  <Text style={[styles.glyph, { color: on ? colors.ink : colors.lilac }]}>{l.glyph}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{l.name}</Text>
                    <View style={[styles.tag, i > 0 && styles.tagHot]}>
                      <Text style={[styles.tagText, i > 0 && { color: surface.lime, fontFamily: fonts.bodyBold }]}>
                        {l.tag.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[type.metadata, { color: surface.onSurfaceVariant }]}>{l.greeting}</Text>
                </View>
                <View style={[styles.check, on && { backgroundColor: surface.lime }]}>
                  {on ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.soon}>
          <View style={styles.soonHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Ionicons name="language" size={18} color={surface.lime} />
              <Text style={styles.soonTitle}>MORE LANGUAGES SOON</Text>
            </View>
            <Text style={[type.micro, { color: colors.lilac, fontFamily: fonts.mono }]}>ROLLING OUT</Text>
          </View>
          <View style={styles.chips}>
            {UPCOMING_LANGUAGES.map((l) => (
              <View key={l} style={styles.chip}>
                <Text style={[type.metadata, { color: surface.onSurfaceVariant }]}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.teaser}>
          <View style={styles.logoTile}>
            <MajaLogo size="sm" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.teaserTitle}>Every swipe is a game</Text>
            <Text style={[type.metadata, { color: surface.onSurfaceVariant }]}>
              Regional quizzes, cinema trivia, and desi banter await inside!
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <CtaButton
            label="Continue"
            onPress={() => {
              void setLanguage(selected);
              onNext();
            }}
            style={{ alignSelf: "stretch" }}
          />
          <View style={styles.note}>
            <Ionicons name="settings-outline" size={14} color={colors.lilac} />
            <Text style={[type.metadata, { color: colors.lilac }]}>You can change this in Settings anytime</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { flexGrow: 1, paddingHorizontal: spacing.margin },
  hero: {
    backgroundColor: surface.low,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.6,
    color: surface.onSurface,
  },
  options: { gap: spacing.md, marginBottom: spacing.lg },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: surface.high,
  },
  optionOn: { backgroundColor: colors.cardAlt, boxShadow: "0 6px 16px rgba(0,0,0,0.35)" },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: surface.highest,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  name: { fontFamily: fonts.display, fontSize: 16, lineHeight: 22, color: surface.onSurface },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: surface.lowest,
  },
  tagHot: { backgroundColor: "rgba(189,245,50,0.2)" },
  tagText: { ...type.micro, color: colors.lilac, letterSpacing: 0.6 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: surface.highest,
    alignItems: "center",
    justifyContent: "center",
  },
  soon: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: surface.lowest,
    marginBottom: spacing.xl,
  },
  soonHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  soonTitle: { ...type.metadata, fontFamily: fonts.bodyBold, letterSpacing: 0.8, color: surface.onSurface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: surface.high,
  },
  teaser: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: surface.low,
    marginBottom: spacing.xl,
  },
  logoTile: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  teaserTitle: { fontFamily: fonts.display, fontSize: 14, lineHeight: 20, color: surface.onSurface },
  footer: { marginTop: "auto", alignItems: "center", gap: spacing.sm },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
});
