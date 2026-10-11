import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, isApiError } from "../../api";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BackButton, CtaButton, onboardingStyles } from "./ui";

export type Category = { id: string; name: string };

type Props = { onDone: (picked: Category[]) => void; onBack?: () => void };

const FALLBACK: Category[] = [
  { id: "sports", name: "Sports" },
  { id: "cricket", name: "Cricket" },
  { id: "news", name: "News" },
  { id: "pop-culture", name: "Pop Culture" },
  { id: "food", name: "Food" },
  { id: "weather", name: "Weather" },
  { id: "tech", name: "Tech" },
  { id: "music", name: "Music" },
  { id: "travel", name: "Travel" },
  { id: "general-knowledge", name: "General Knowledge" },
];

const ICONS: [string, string][] = [
  ["cricket", "🏏"],
  ["sport", "⚽"],
  ["news", "📰"],
  ["politic", "🏛️"],
  ["pop", "🎬"],
  ["bollywood", "🎬"],
  ["entertainment", "🎬"],
  ["movie", "🎬"],
  ["cinema", "🎬"],
  ["k-drama", "📺"],
  ["food", "🍜"],
  ["weather", "⛅"],
  ["tech", "💻"],
  ["science", "🔬"],
  ["music", "🎵"],
  ["travel", "✈️"],
  ["knowledge", "💡"],
  ["trivia", "💡"],
  ["meme", "😂"],
  ["fashion", "👗"],
  ["health", "💪"],
  ["relationship", "💜"],
  ["puzzle", "🧩"],
  ["trending", "🔥"],
  ["india", "🇮🇳"],
];

function iconFor(c: Category): string {
  const hay = `${c.id} ${c.name}`.toLowerCase();
  return ICONS.find(([k]) => hay.includes(k))?.[1] ?? "✨";
}

export function InterestsScreen({ onDone, onBack }: Props) {
  const insets = useSafeAreaInsets();
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
        setLoadError("Couldn't load interests from the server — showing defaults.");
      }
    } catch (e) {
      setCategories(FALLBACK);
      setUsingFallback(true);
      setLoadError(isApiError(e) ? e.userMessage : "Couldn't load interests — showing defaults.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  async function finish() {
    setSaveError("");
    if (picked.length && !usingFallback) {
      setSaving(true);
      try {
        await api("/v1/me/interests", {
          method: "PUT",
          body: JSON.stringify({ categoryIds: picked }),
        });
      } catch (e) {
        setSaveError(isApiError(e) ? e.userMessage : "Could not save interests.");
        return;
      } finally {
        setSaving(false);
      }
    }
    onDone(categories.filter((c) => picked.includes(c.id)));
  }

  return (
    <View style={[onboardingStyles.root, { paddingTop: insets.top + 4 }]}>
      <View style={styles.pad}>
        <View style={onboardingStyles.header}>{onBack ? <BackButton onPress={onBack} plain /> : null}</View>
      </View>

      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: 170 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          What do you <Text style={{ color: colors.pink }}>love?</Text>
        </Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: 6 }]}>Pick a few — we'll personalize your game feed.</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={surface.lime} size="large" />
            <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>Loading interests…</Text>
          </View>
        ) : (
          <>
            {loadError ? (
              <Pressable onPress={() => void loadCategories()} accessibilityRole="button" style={{ marginTop: spacing.sm }}>
                <Text style={[type.metadata, { color: colors.pinkSoft }]}>
                  {loadError} <Text style={{ fontFamily: fonts.bodyBold, textDecorationLine: "underline" }}>Retry</Text>
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.grid}>
              {categories.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    {on ? (
                      <View style={styles.check}>
                        <Ionicons name="checkmark" size={14} color={colors.ink} />
                      </View>
                    ) : null}
                    <View style={styles.iconBox}>
                      <Text style={styles.emoji}>{iconFor(c)}</Text>
                    </View>
                    <Text
                      style={[styles.tileLabel, on && { color: surface.lime, fontFamily: fonts.bodyBold }]}
                      numberOfLines={2}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

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
          label={saving ? "Saving…" : "Continue"}
          icon={saving ? null : "arrow-forward"}
          disabled={loading || saving}
          onPress={() => void finish()}
          style={{ alignSelf: "stretch" }}
        />
        <Text style={onboardingStyles.stepLabel}>Step 5 of 5</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.margin },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.6, color: colors.paper, marginTop: spacing.md },
  center: { paddingVertical: 80, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, marginTop: spacing.lg },
  tile: {
    width: "48.2%",
    aspectRatio: 1 / 0.95,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
  },
  tileOn: { backgroundColor: colors.cardAlt, boxShadow: "0 10px 20px rgba(189,245,50,0.1)" },
  check: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: surface.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: surface.container,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emoji: { fontSize: 32 },
  tileLabel: { ...type.bodySm, fontFamily: fonts.bodyMedium, color: colors.paper, textAlign: "center", letterSpacing: 0.3 },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
});
