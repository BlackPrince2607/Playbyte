import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, isApiError } from "../../api";
import { PrimaryButton } from "../../components/PrimaryButton";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = { onDone: (ids: string[]) => void };

type Category = { id: string; name: string };

const FALLBACK: Category[] = [
  { id: "cricket", name: "Cricket" },
  { id: "bollywood", name: "Bollywood" },
  { id: "food", name: "Food" },
  { id: "tech", name: "Tech" },
  { id: "sports", name: "Sports" },
  { id: "memes", name: "Memes" },
  { id: "music", name: "Music" },
  { id: "politics", name: "Politics" },
];

export function InterestsScreen({ onDone }: Props) {
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
        setLoadError("No categories from server — showing defaults.");
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
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    onDone(picked);
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 24 }]}>
      <Text style={[type.hero, { color: colors.paper }]}>What do you love?</Text>
      <Text style={[type.bodyLg, { color: colors.lilac, marginTop: spacing.sm }]}>
        Pick a few — we’ll personalize your feed.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.lime} size="large" />
          <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>Loading interests…</Text>
        </View>
      ) : (
        <>
          {loadError ? (
            <Text style={[type.metadata, { color: colors.pinkSoft, marginTop: spacing.sm }]}>{loadError}</Text>
          ) : null}
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {categories.map((c) => {
              const on = picked.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                  style={[styles.card, on && styles.cardOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {saveError ? (
          <Text style={[type.metadata, { color: colors.pinkSoft, textAlign: "center" }]}>{saveError}</Text>
        ) : null}
        {picked.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={[type.statsSm, { color: colors.pink }]}>{picked.length} selected</Text>
          </View>
        ) : null}
        <PrimaryButton
          label={saving ? "Saving…" : picked.length ? "Let’s play" : "Skip"}
          trailingIcon={picked.length && !saving ? "arrow-forward" : undefined}
          disabled={loading || saving}
          onPress={() => void finish()}
        />
        {loadError ? (
          <PrimaryButton label="Retry load" variant="secondary" onPress={() => void loadCategories()} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.margin },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingBottom: 160,
  },
  card: {
    width: "47%",
    height: 96,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  cardOn: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.pink,
    borderWidth: 2,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.lg,
    backgroundColor: colors.ink,
    gap: spacing.sm,
  },
  countPill: {
    alignSelf: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,77,141,0.3)",
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: spacing.xs,
  },
});
