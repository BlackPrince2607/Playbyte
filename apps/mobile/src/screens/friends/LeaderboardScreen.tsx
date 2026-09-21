import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "../../components/AvatarImage";
import { PlayLogo } from "../../components/PlayLogo";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { colors, radius, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  onBack: () => void;
  onSignIn?: () => void;
};

const SCOPES = ["Friends", "Bengaluru", "Karnataka", "India"] as const;

/** Friends-framed board. Public ranks are deferred — no fabricated scores. */
export function LeaderboardScreen({ onBack, onSignIn }: Props) {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { friends, streak } = useApp();
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("Friends");

  const friendsOnly = scope === "Friends";

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.paper} />
        </Pressable>
        <PlayLogo soft />
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[type.screenTitle, { color: colors.paper, marginTop: spacing.md }]}>
          Who’s winning?
        </Text>
        <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.xs }]}>
          Friends board for now — public ranks come later.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopes}>
          {SCOPES.map((s) => {
            const on = scope === s;
            return (
              <Pressable key={s} onPress={() => setScope(s)} style={[styles.scope, on && styles.scopeOn]}>
                <Text
                  style={[
                    type.metadata,
                    {
                      color: on ? colors.paper : colors.lilac,
                      fontFamily: on ? fonts.bodyBold : fonts.body,
                    },
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.positionCard}>
          <Text style={[type.metadata, { color: colors.lilac, letterSpacing: 2 }]}>YOUR STREAK</Text>
          <Text style={[type.largeScore, { color: colors.pinkSoft, fontSize: 56, marginVertical: 8 }]}>
            {isSignedIn || streak > 0 ? streak : "—"}
          </Text>
          <View style={styles.pills}>
            <View style={styles.pill}>
              <Text style={[type.bodySm, { color: colors.paper }]}>{scope}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={[type.bodySm, { color: colors.lime }]}>
                {friendsOnly ? `${friends.length} friends` : "Coming soon"}
              </Text>
            </View>
          </View>
        </View>

        {!isSignedIn ? (
          <View style={styles.signInCard}>
            <Text style={[type.bodyLg, { color: colors.paper }]}>Sign in to see friends on this board.</Text>
            {onSignIn ? <PrimaryButton label="Sign in" onPress={onSignIn} /> : null}
          </View>
        ) : null}

        {!friendsOnly ? (
          <View style={styles.soonCard}>
            <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
              {scope} ranks aren’t live yet
            </Text>
            <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.xs }]}>
              Switch back to Friends to see people you’ve added.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {friends.length === 0 ? (
              <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", marginTop: spacing.lg }]}>
                Add friends from the Friends tab — they’ll show up here.
              </Text>
            ) : (
              friends.map((f, i) => (
                <View key={f.userId ?? f.displayName + i} style={styles.row}>
                  <Text style={[type.statsSm, { color: colors.lilac, width: 36, textAlign: "right" }]}>
                    #{i + 1}
                  </Text>
                  <AvatarImage displayName={f.displayName} avatarKey={f.avatarKey} size={40} />
                  <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold, flex: 1 }]}>
                    {f.displayName}
                  </Text>
                  <Text style={[type.micro, { color: colors.lilac }]}>Friend</Text>
                </View>
              ))
            )}

            {isSignedIn ? (
              <View style={[styles.row, styles.youRow]}>
                <Text style={[type.statsSm, { color: colors.paper, width: 36, textAlign: "right" }]}>—</Text>
                <AvatarImage displayName="You" size={40} />
                <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold, flex: 1 }]}>You</Text>
                <Text style={[type.statsSm, { color: colors.paper }]}>{streak}🔥</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={[type.metadata, { color: colors.lilac, textAlign: "center", marginTop: spacing.lg }]}>
          Competitive ranks are intentionally deferred for MVP testing.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.margin },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scopes: { gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  scope: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cardAlt,
  },
  scopeOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  positionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  pills: { flexDirection: "row", gap: spacing.sm },
  pill: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  signInCard: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  soonCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  youRow: {
    backgroundColor: colors.pink,
    borderColor: colors.pinkSoft,
    borderWidth: 2,
    transform: [{ scale: 1.02 }],
    marginTop: spacing.sm,
  },
});
