import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MajaLogo } from "../../components/MajaLogo";
import { useLanguage } from "../../context/LanguageContext";
import { appLang } from "../../i18n/lang";
import { capture } from "../../lib/analytics";
import { APP_LANGUAGES, UPCOMING_LANGUAGES, supportedLanguage } from "../../lib/languages";
import { lineHeightFor } from "../../lib/promptSize";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BackButton, CtaButton, Glow, PulseDot, onboardingStyles } from "./ui";

type Props = { onNext: () => void; onBack?: () => void };

const TITLE_SIZE = 32;

export function LanguageScreen({ onNext, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { language, setAppLanguage, t, fonts: ui } = useLanguage();
  const [selected, setSelected] = useState(language);
  const trackedLanguage = useRef(false);

  useEffect(() => {
    setSelected(appLang(supportedLanguage(language)));
  }, [language]);

  const title = `${t("languageTitleBefore")}${t("languageTitleAccent")}`;

  return (
    <View
      style={[
        onboardingStyles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, paddingHorizontal: spacing.margin },
      ]}
    >
      {onBack ? (
        <View style={{ marginBottom: spacing.xs }}>
          <BackButton onPress={onBack} />
        </View>
      ) : null}

      <View style={styles.hero}>
        <Glow color="rgba(255,77,141,0.22)" size={200} style={{ right: -70, bottom: -80 }} />
        <PulseDot size={6} color={surface.lime} />
        <Text
          style={[
            onboardingStyles.title,
            { fontFamily: ui.display, lineHeight: lineHeightFor(title, TITLE_SIZE), marginTop: spacing.xs },
          ]}
        >
          {t("languageTitleBefore")}
          <Text style={onboardingStyles.accent}>{t("languageTitleAccent")}</Text>
        </Text>
        <Text style={[onboardingStyles.lede, { fontFamily: ui.body }]}>{t("languageLede")}</Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={t("selectLanguage")} style={styles.options}>
        {APP_LANGUAGES.map((l, i) => {
          const on = selected === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => {
                const next = appLang(l.id);
                setSelected(next);
                setAppLanguage(l.id);
                capture("language_selected", { language: next });
                trackedLanguage.current = true;
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <View style={[styles.badge, on && { backgroundColor: surface.lime }]}>
                <Text style={[styles.glyph, { color: on ? colors.ink : colors.lilac, fontFamily: ui.display }]}>{l.glyph}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { fontFamily: ui.display }]}>{l.name}</Text>
                  <View style={[styles.tag, i > 0 && styles.tagHot]}>
                    <Text style={[styles.tagText, i > 0 && { color: surface.lime, fontFamily: ui.bodyBold }]}>
                      {l.tag.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={[type.metadata, { color: surface.onSurfaceVariant, fontFamily: ui.body }]}>{l.greeting}</Text>
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 }}>
            <Ionicons name="language" size={18} color={surface.lime} />
            <Text style={[styles.soonTitle, { fontFamily: ui.bodyBold }]} numberOfLines={1}>
              {t("moreLanguagesSoon")}
            </Text>
          </View>
          <Text style={[type.micro, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>{t("rollingOut")}</Text>
        </View>
        <View style={styles.chips}>
          {UPCOMING_LANGUAGES.map((l) => (
            <View key={l} style={styles.chip}>
              <Text style={[type.metadata, { color: surface.onSurfaceVariant, fontFamily: ui.body }]}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.teaser}>
        <View style={styles.logoTile}>
          <MajaLogo size="sm" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.teaserTitle, { fontFamily: ui.display }]}>{t("everySwipeTeaser")}</Text>
          <Text style={[type.metadata, { color: surface.onSurfaceVariant, fontFamily: ui.body }]} numberOfLines={2}>
            {t("teaserBody")}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <CtaButton
          label={t("continue")}
          onPress={() => {
            if (!trackedLanguage.current) {
              setAppLanguage(selected);
              capture("language_selected", { language: selected });
              trackedLanguage.current = true;
            }
            onNext();
          }}
          style={{ alignSelf: "stretch" }}
        />
        <View style={styles.note}>
          <Ionicons name="settings-outline" size={14} color={colors.lilac} />
          <Text style={[type.metadata, { color: colors.lilac, fontFamily: ui.body, flexShrink: 1 }]} numberOfLines={2}>
            {t("changeInSettings")}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: surface.low,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  options: { gap: spacing.sm, marginBottom: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: surface.high,
  },
  optionOn: { backgroundColor: colors.cardAlt, boxShadow: "0 6px 16px rgba(0,0,0,0.35)" },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: surface.highest,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
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
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: surface.lowest,
    marginBottom: spacing.sm,
  },
  soonHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  soonTitle: { ...type.metadata, fontFamily: fonts.bodyBold, letterSpacing: 0.8, color: surface.onSurface, flexShrink: 1 },
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
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: surface.low,
    marginBottom: spacing.sm,
  },
  logoTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  teaserTitle: { fontFamily: fonts.display, fontSize: 14, lineHeight: 20, color: surface.onSurface },
  footer: { marginTop: "auto", alignItems: "center", gap: spacing.xs },
  note: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
});
