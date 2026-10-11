import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { languageName } from "../../lib/languages";
import { getLanguage, getLocalProfile } from "../../lib/storage";
import { colors, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BackButton, BrandDiamond, CtaButton, Glow, onboardingStyles } from "./ui";

type Props = { interests: string[]; onDone: () => void; onBack: () => void; busy?: boolean };

export function ReadyScreen({ interests, onDone, onBack, busy }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [language, setLanguageState] = useState("en");

  useEffect(() => {
    void getLocalProfile().then((p) => setName(p?.name ?? ""));
    void getLanguage().then(setLanguageState);
  }, []);

  const firstName = name.split(/\s+/)[0];

  return (
    <View style={onboardingStyles.root}>
      <Glow color="rgba(255,77,141,0.28)" size={380} style={{ top: 40, alignSelf: "center" }} />
      <Glow color="rgba(189,245,50,0.12)" size={260} style={{ bottom: 140, left: -100 }} />

      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={onboardingStyles.header}>
          <BackButton onPress={onBack} plain />
        </View>

        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.mark}>
          <BrandDiamond size={88} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(320)}>
          <Text style={styles.title}>
            You're all <Text style={onboardingStyles.accent}>set</Text>
            {firstName ? `, ${firstName}` : ""}.
          </Text>
          <Text style={[type.bodyLg, { color: surface.onSurfaceVariant, textAlign: "center", marginTop: spacing.sm }]}>
            Your game feed is tuned and ready. New games drop every day.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(320)} style={styles.card}>
          <Row icon="language" label="Language" value={languageName(language)} />
          <Row icon="person-circle-outline" label="Playing as" value={user?.email ?? (name ? `${name} · Guest` : "Guest")} />
          <View style={styles.interestBlock}>
            <View style={styles.rowHead}>
              <Ionicons name="heart-outline" size={16} color={colors.lilac} />
              <Text style={styles.rowLabel}>Interests</Text>
            </View>
            {interests.length ? (
              <View style={styles.chips}>
                {interests.map((i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{i}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[type.bodySm, { color: colors.paper }]}>A bit of everything</Text>
            )}
          </View>
        </Animated.View>

        <View style={{ marginTop: "auto", paddingTop: spacing.xl }}>
          <CtaButton label={busy ? "Loading your feed…" : "Let's go"} icon={busy ? null : "rocket-outline"} onPress={onDone} disabled={busy} />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Ionicons name={icon} size={16} color={colors.lilac} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { flexGrow: 1, paddingHorizontal: spacing.margin },
  mark: { alignItems: "center", justifyContent: "center", height: 180, marginTop: spacing.lg },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.6,
    color: colors.paper,
    textAlign: "center",
  },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowLabel: { ...type.bodySm, color: colors.lilac },
  rowValue: { ...type.bodySm, fontFamily: fonts.bodyBold, color: colors.paper, flexShrink: 1 },
  interestBlock: { paddingVertical: 14, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(189,245,50,0.15)",
    borderWidth: 1,
    borderColor: "rgba(189,245,50,0.35)",
  },
  chipText: { ...type.metadata, fontFamily: fonts.bodyBold, color: surface.lime },
});
