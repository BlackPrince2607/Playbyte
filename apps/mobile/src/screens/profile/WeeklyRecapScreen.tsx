import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, isApiError, WeeklyRecap } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useAuth } from "../../context/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors, radius, spacing } from "../../theme/colors";
import { type } from "../../theme/typography";

type Props = {
  onBack: () => void;
  onSignIn?: () => void;
};

function badgeLabel(badge: string): string {
  if (badge === "showed-up") return "Showed up";
  if (badge === "in-the-crowd") return "In the crowd";
  return badge;
}

export function WeeklyRecapScreen({ onBack, onSignIn }: Props) {
  const { isSignedIn } = useAuth();
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRecap = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setError("");
    try {
      const res = await api<WeeklyRecap>("/v1/me/recap/weekly");
      setRecap(res);
    } catch (e) {
      setError(isApiError(e) ? e.userMessage : "Could not load recap.");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (isSignedIn) void loadRecap();
    else setRecap(null);
  }, [isSignedIn, loadRecap]);

  if (!isSignedIn) {
    return (
      <View style={styles.wrap}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={{ color: colors.pinkSoft }}>‹ Back</Text>
        </Pressable>
        <Text style={[type.screenTitle, { color: colors.paper }]}>Weekly recap</Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginVertical: spacing.md }]}>
          Sign in to see your week in the crowd.
        </Text>
        {isSupabaseConfigured() && onSignIn ? <PrimaryButton label="Sign in" onPress={onSignIn} /> : null}
      </View>
    );
  }

  if (loading && !recap) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={{ color: colors.pinkSoft }}>‹ Back</Text>
        </Pressable>
        <ActivityIndicator color={colors.lime} size="large" />
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.md }]}>Loading your week…</Text>
      </View>
    );
  }

  if (error && !recap) {
    return (
      <View style={styles.wrap}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={{ color: colors.pinkSoft }}>‹ Back</Text>
        </Pressable>
        <ErrorState message={error} onRetry={() => void loadRecap()} />
      </View>
    );
  }

  const noActivity =
    recap &&
    recap.momentsJoined === 0 &&
    recap.gamesPlayed === 0 &&
    recap.activeDays === 0;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={{ color: colors.pinkSoft }}>‹ Back</Text>
      </Pressable>
      <Text style={[type.screenTitle, { color: colors.paper }]}>Weekly recap</Text>
      {recap ? (
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.sm }]}>
          {recap.periodStart} — {recap.periodEnd}
        </Text>
      ) : null}

      {noActivity ? (
        <EmptyState
          title="Quiet week"
          message="Join a moment or play a mini-game to start building your recap."
        />
      ) : recap ? (
        <>
          <View style={styles.statGrid}>
            <StatCard label="Moments joined" value={String(recap.momentsJoined)} />
            <StatCard label="Games played" value={String(recap.gamesPlayed)} />
            <StatCard label="Active days" value={String(recap.activeDays)} />
            <StatCard label="Majority match" value={`${Math.round(recap.majorityMatchPercent)}%`} />
            <StatCard label="People alongside" value={String(recap.uniquePeopleAlongside)} />
          </View>
          {recap.badges.length > 0 ? (
            <View style={styles.badges}>
              <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 1 }]}>BADGES</Text>
              <View style={styles.badgeRow}>
                {recap.badges.map((b) => (
                  <View key={b} style={styles.badge}>
                    <Text style={[type.bodySm, { color: colors.lime, fontWeight: "700" }]}>{badgeLabel(b)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[type.stats, { color: colors.lime, fontSize: 28 }]}>{value}</Text>
      <Text style={[type.metadata, { color: colors.lilac }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink },
  inner: { padding: spacing.margin, paddingTop: 56, paddingBottom: 100 },
  center: { justifyContent: "center" },
  back: { marginBottom: spacing.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  statCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 4,
  },
  badges: { marginTop: spacing.lg, gap: spacing.sm },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
