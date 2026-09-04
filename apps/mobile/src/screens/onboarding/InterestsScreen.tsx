import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PlayLogo } from "../../components/PlayLogo";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = { onDone: (ids: string[]) => void };

export function InterestsScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    void api<{ categories: { id: string; name: string }[] }>("/v1/categories").then((r) =>
      setCategories(r.categories),
    );
  }, []);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <PlayLogo />
      <Text style={[type.screenTitle, { color: colors.paper, marginTop: spacing.lg }]}>What do you play?</Text>
      <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
        Skip anytime — we’ll mix trending moments.
      </Text>
      <ScrollView contentContainerStyle={styles.chips}>
        {categories.map((c) => {
          const on = picked.includes(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={{ color: colors.paper }}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <PrimaryButton
        label={picked.length ? "Let’s play" : "Skip"}
        onPress={async () => {
          if (picked.length) {
            await api("/v1/me/interests", {
              method: "PUT",
              body: JSON.stringify({ categoryIds: picked }),
            });
          }
          onDone(picked);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.margin },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.lg },
  chip: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
});
