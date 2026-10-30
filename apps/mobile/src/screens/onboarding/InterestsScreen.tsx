import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, isApiError } from "../../api";
import { ScreenLoading } from "../../components/ScreenLoading";
import { useLanguage } from "../../context/LanguageContext";
import { categoryName } from "../../i18n/categories";
import { fill } from "../../i18n/strings";
import { lineHeightFor } from "../../lib/promptSize";
import { colors, spacing, surface } from "../../theme/colors";
import { type } from "../../theme/typography";
import { BackButton, CtaButton, onboardingStyles } from "./ui";

export type Category = { id: string; name: string; slug?: string };

function rowsOf<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

type Props = {
  onDone: (picked: Category[]) => void;
  onBack?: () => void;
  /** Settings: preselect saved interests and use a Save CTA (no onboarding step chrome). */
  mode?: "onboarding" | "settings";
};

const FALLBACK: Category[] = [
  { id: "cricket", name: "Cricket", slug: "cricket" },
  { id: "movies", name: "Bollywood", slug: "movies" },
  { id: "music", name: "Music", slug: "music" },
  { id: "pop-culture", name: "Memes & Pop Culture", slug: "pop-culture" },
  { id: "food", name: "Food", slug: "food" },
  { id: "gaming", name: "Gaming", slug: "gaming" },
  { id: "sports", name: "Sports (Non-Cricket)", slug: "sports" },
  { id: "news", name: "News & Current Affairs", slug: "news" },
  { id: "tech", name: "Technology", slug: "tech" },
  { id: "personality-vibe", name: "Personality & Quizzes", slug: "personality-vibe" },
  { id: "fashion", name: "Fashion & Beauty", slug: "fashion" },
  { id: "health", name: "Health & Fitness", slug: "health" },
  { id: "kpop", name: "K-Pop & K-Drama", slug: "kpop" },
  { id: "puzzles", name: "Puzzles", slug: "puzzles" },
  { id: "logical-reasoning", name: "Logical Reasoning", slug: "logical-reasoning" },
  { id: "math-numbers", name: "Math & Numbers", slug: "math-numbers" },
];

const ICONS: [string, string][] = [
  ["cricket", "🏏"],
  ["movie", "🍿"],
  ["bollywood", "🍿"],
  ["music", "🎵"],
  ["pop", "😂"],
  ["meme", "😂"],
  ["food", "🍔"],
  ["gaming", "🎮"],
  ["game", "🎮"],
  ["sport", "⚽"],
  ["news", "📰"],
  ["tech", "💻"],
  ["science", "💻"],
  ["personality", "🎯"],
  ["vibe", "🎯"],
  ["fashion", "🛍️"],
  ["beauty", "🛍️"],
  ["health", "💪"],
  ["fitness", "💪"],
  ["kpop", "📺"],
  ["k-drama", "📺"],
  ["drama", "📺"],
  ["puzzle", "🧩"],
  ["logical", "🧠"],
  ["math", "🧮"],
  ["number", "🧮"],
];

function iconFor(c: Category): string {
  const hay = `${c.id} ${c.slug ?? ""} ${c.name}`.toLowerCase();
  return ICONS.find(([k]) => hay.includes(k))?.[1] ?? "✨";
}

export function InterestsScreen({ onDone, onBack, mode = "onboarding" }: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui, language } = useLanguage();
  const settings = mode === "settings";
  const [categories, setCategories] = useState<Category[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function loadCategories() {
    setLoading(true);
    setLoadError("");
    setUsingFallback(false);
    try {
      const r = await api<{ categories: Category[] }>("/v1/categories");
      if (r.categories?.length) {
        setCategories(r.categories);
      } else {
        setCategories(FALLBACK);
        setUsingFallback(true);
        setLoadError(t("interestsFallback"));
      }
      if (settings) {
        try {
          const mine = await api<{ categories: Category[] }>("/v1/me/interests");
          setPicked((mine.categories ?? []).map((c) => c.id));
        } catch {
          /* keep empty selection if interests can't load */
        }
      }
    } catch (e) {
      setCategories(FALLBACK);
      setUsingFallback(true);
      setLoadError(isApiError(e) ? e.userMessage : t("interestsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  async function finish() {
    setSaveError("");
    const shouldPersist = !usingFallback && (settings || picked.length > 0);
    if (settings && usingFallback) {
      setSaveError(t("couldNotSaveInterests"));
      return;
    }
    if (shouldPersist) {
      setSaving(true);
      try {
        await api("/v1/me/interests", {
          method: "PUT",
          body: JSON.stringify({ categoryIds: picked }),
        });
      } catch (e) {
        setSaveError(isApiError(e) ? e.userMessage : t("couldNotSaveInterests"));
        return;
      } finally {
        setSaving(false);
      }
    }
    onDone(categories.filter((c) => picked.includes(c.id)));
  }

  const titleBefore = settings ? t("editInterestsTitleBefore") : t("interestsTitleBefore");
  const titleAccent = settings ? t("editInterestsTitleAccent") : t("interestsTitleAccent");
  const lede = settings ? t("editInterestsLede") : t("interestsLede");

  return (
    <View style={[onboardingStyles.root, { paddingTop: insets.top + 4 }]}>
      <View style={styles.pad}>
        <View style={onboardingStyles.header}>{onBack ? <BackButton onPress={onBack} plain /> : null}</View>
      </View>

      <View style={[styles.pad, { flex: 1, minHeight: 0, paddingBottom: 108 + insets.bottom }]}>
        <Text
          style={[
            onboardingStyles.title,
            {
              fontFamily: ui.display,
              lineHeight: lineHeightFor(`${titleBefore}${titleAccent}`, 32),
              marginTop: spacing.xs,
            },
          ]}
        >
          {titleBefore}
          <Text style={{ color: colors.pink }}>{titleAccent}</Text>
        </Text>
        <Text style={[onboardingStyles.lede, { fontFamily: ui.body, color: colors.lilac }]}>{lede}</Text>

        {loading ? (
          <ScreenLoading label={t("loadingInterests")} style={styles.center} />
        ) : (
          <>
            {loadError ? (
              <Pressable onPress={() => void loadCategories()} accessibilityRole="button" style={{ marginTop: spacing.xs }}>
                <Text style={[type.metadata, { color: colors.pinkSoft, fontFamily: ui.body }]}>
                  {loadError}{" "}
                  <Text style={{ fontFamily: ui.bodyBold, textDecorationLine: "underline" }}>{t("retry")}</Text>
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.grid}>
              {rowsOf(categories, 2).map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {row.map((c) => {
                    const on = picked.includes(c.id);
                    const name = categoryName(c.slug ?? c.id, c.name, language);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { transform: [{ scale: 0.98 }] }]}
                      >
                        <Text style={styles.emoji}>{iconFor(c)}</Text>
                        <Text
                          style={[styles.tileLabel, { fontFamily: on ? ui.bodyBold : ui.bodyMedium }, on && { color: surface.lime }]}
                          numberOfLines={2}
                        >
                          {name}
                        </Text>
                        {on ? <Ionicons name="checkmark-circle" size={16} color={surface.lime} /> : null}
                      </Pressable>
                    );
                  })}
                  {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <LinearGradient
        colors={["transparent", "rgba(29,16,19,0.95)", surface.base]}
        locations={[0, 0.35, 1]}
        style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}
      >
        {saveError ? (
          <Text style={[type.metadata, { color: colors.pinkSoft, textAlign: "center" }]} accessibilityRole="alert">
            {saveError}
          </Text>
        ) : null}
        <CtaButton
          label={saving ? t("saving") : settings ? t("save") : t("continue")}
          icon={saving ? null : settings ? "checkmark" : "arrow-forward"}
          disabled={loading || saving}
          onPress={() => void finish()}
          style={{ alignSelf: "stretch" }}
        />
        {settings ? null : (
          <Text style={[onboardingStyles.stepLabel, { fontFamily: ui.bodyBold }]}>
            {fill(t("stepOf"), { step: 5, total: 5 })}
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.margin },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: { flex: 1, marginTop: spacing.sm, gap: 8 },
  row: { flex: 1, flexDirection: "row", gap: 8 },
  tile: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    minHeight: 0,
  },
  tileSpacer: { flex: 1 },
  tileOn: { backgroundColor: colors.cardAlt },
  emoji: { fontSize: 18 },
  tileLabel: { ...type.bodySm, flex: 1, color: colors.paper },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
});
