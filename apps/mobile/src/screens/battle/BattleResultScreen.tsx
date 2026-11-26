import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "../../components/AvatarImage";
import { CloseButton } from "../../components/CloseButton";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useApp } from "../../context/AppContext";
import { useLanguage } from "../../context/LanguageContext";
import { fill } from "../../i18n/strings";
import { colors, radius, spacing, surface } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";

type Props = {
  gameTitle: string;
  myScore: number;
  theirScore: number | null;
  opponentName: string;
  opponentAvatarKey?: string | null;
  status: string;
  onClose: () => void;
};

function RaceTrack({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.raceTrack}>
      <View
        style={[
          styles.raceFill,
          { width: `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function BattleResultScreen({
  gameTitle,
  myScore,
  theirScore,
  opponentName,
  opponentAvatarKey,
  status,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t, fonts: ui } = useLanguage();
  const { me } = useApp();
  const theirDone = theirScore != null;
  const finished =
    status === "completed" || status === "forfeit" || status === "expired" || status === "cancelled";
  const waiting = !finished && !theirDone;

  const [pulse, setPulse] = useState(0.55);
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setPulse((p) => (p >= 0.92 ? 0.45 : p + 0.08)), 180);
    return () => clearInterval(id);
  }, [waiting]);

  const outcome =
    theirDone
      ? myScore === theirScore
        ? t("challengeTie")
        : myScore > theirScore
          ? t("challengeYouWon")
          : t("challengeYouLost")
      : status === "forfeit" || status === "expired"
        ? t("challengeYouWon")
        : waiting
          ? t("finishingMatch")
          : t("resultWord");

  const max = Math.max(myScore, theirScore ?? 0, 1);
  const myPct = theirDone ? myScore / max : 1;
  const theirPct = theirDone ? (theirScore ?? 0) / max : pulse;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <CloseButton onPress={onClose} color={colors.paper} style={styles.close} />
        <Text style={[type.bodyLg, styles.headerTitle]} numberOfLines={1}>
          {gameTitle}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[type.metadata, styles.eyebrow]} numberOfLines={1}>
          {gameTitle.toUpperCase()} · {t("resultWord")}
        </Text>
        <Text
          style={[
            type.hero,
            { color: colors.paper, textAlign: "center", fontFamily: ui.display, fontSize: 32 },
          ]}
        >
          {outcome}
        </Text>

        <View style={styles.duelCard}>
          {waiting ? (
            <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", fontFamily: fonts.body }]}>
              {fill(t("waitingForOpponent"), { name: opponentName })}
            </Text>
          ) : null}

          <View style={styles.duelPlayers}>
            <View style={styles.duelCol}>
              <View style={[styles.duelPfp, { borderColor: surface.lime }]}>
                <AvatarImage
                  displayName={me?.displayName ?? t("youName")}
                  avatarKey={me?.avatarKey ?? null}
                  size={64}
                />
              </View>
              <Text style={[styles.duelName, { color: surface.lime }]} numberOfLines={1}>
                {me?.displayName ?? t("youName")}
              </Text>
              <Text style={[type.largeScore, { color: colors.paper, fontSize: 36, lineHeight: 42 }]}>
                {myScore}
              </Text>
              <RaceTrack pct={myPct} color={surface.lime} />
            </View>

            <Text style={styles.duelVs}>VS</Text>

            <View style={styles.duelCol}>
              <View style={[styles.duelPfp, { borderColor: colors.pink }]}>
                <AvatarImage displayName={opponentName} avatarKey={opponentAvatarKey ?? null} size={64} />
              </View>
              <Text style={[styles.duelName, { color: colors.pink }]} numberOfLines={1}>
                {opponentName}
              </Text>
              <Text style={[type.largeScore, { color: colors.paper, fontSize: 36, lineHeight: 42 }]}>
                {theirDone ? theirScore : "—"}
              </Text>
              <RaceTrack pct={theirPct} color={colors.pink} />
            </View>
          </View>

          <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center", marginTop: spacing.sm }]}>
            {fill(t("challengeCompleted"), {
              my: myScore,
              their: theirScore ?? "—",
              name: opponentName,
            })}
          </Text>
        </View>

        <PrimaryButton label={t("done")} onPress={onClose} style={{ alignSelf: "stretch" }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    height: 64,
    paddingHorizontal: spacing.margin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.paper,
    fontFamily: fonts.display,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  body: {
    paddingHorizontal: spacing.margin,
    gap: spacing.md,
    alignItems: "center",
  },
  eyebrow: {
    color: colors.lilac,
    letterSpacing: 1.4,
    textAlign: "center",
  },
  duelCard: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  duelPlayers: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  duelCol: { flex: 1, alignItems: "center", gap: 6 },
  duelPfp: {
    borderRadius: 40,
    borderWidth: 3,
    padding: 2,
  },
  duelName: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    maxWidth: "100%",
  },
  duelVs: {
    fontFamily: fonts.display,
    color: colors.lilac,
    fontSize: 14,
    letterSpacing: 1,
  },
  raceTrack: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cardAlt,
    overflow: "hidden",
    marginTop: 4,
  },
  raceFill: { height: "100%", borderRadius: 3 },
});
