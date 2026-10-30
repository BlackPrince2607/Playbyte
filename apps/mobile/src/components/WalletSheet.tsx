import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { useLanguage } from "../context/LanguageContext";
import { fill } from "../i18n/strings";
import { guestFreeHintsLeft } from "../lib/storage";
import { colors, radius, spacing } from "../theme/colors";
import { type } from "../theme/typography";
import { BottomSheetShell } from "./BottomSheetShell";
import { CoinIcon } from "./CoinIcon";
import { GuestGate } from "./GuestGate";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** When set, guests can leave for sign-in. Omitted during a game so the round stays on screen. */
  onSignIn?: () => void;
};

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function ProgressRow({
  icon,
  iconColor,
  title,
  ratio,
  detail,
  progress,
  fillColor,
  fonts,
}: {
  icon: IoniconName;
  iconColor: string;
  title: string;
  ratio: string;
  detail?: string;
  progress?: number;
  fillColor?: string;
  fonts: { body: string; bodyBold: string };
}) {
  const clamped = Math.max(0, Math.min(1, progress ?? 0));
  return (
    <View style={styles.progressRow}>
      <View style={[styles.progressIcon, { backgroundColor: `${iconColor}22` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.progressBody}>
        <View style={styles.progressHead}>
          <Text style={[type.button, { color: colors.paper, fontFamily: fonts.bodyBold, flex: 1 }]}>{title}</Text>
          <Text style={[type.statsSm, { color: colors.lime }]}>{ratio}</Text>
        </View>
        {detail ? (
          <Text style={[type.metadata, { color: colors.lilac, fontFamily: fonts.body }]}>{detail}</Text>
        ) : null}
        {progress != null ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: fillColor ?? colors.lime }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function EarnRow({
  icon,
  iconColor,
  title,
  body,
  fonts,
}: {
  icon: IoniconName;
  iconColor: string;
  title: string;
  body: string;
  fonts: { body: string; bodyBold: string };
}) {
  return (
    <View style={styles.earnRow}>
      <View style={[styles.progressIcon, { backgroundColor: `${iconColor}22` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.button, { color: colors.paper, fontFamily: fonts.bodyBold }]}>{title}</Text>
        <Text style={[type.bodySm, { color: colors.lilac, fontFamily: fonts.body }]}>{body}</Text>
      </View>
    </View>
  );
}

export function WalletSheet({ visible, onClose, onSignIn }: Props) {
  const { isSignedIn } = useAuth();
  const { wallet, refreshWallet, coinCredit } = useApp();
  const { t, fonts: ui } = useLanguage();
  const [guestLeft, setGuestLeft] = useState(0);
  const credited = visible && coinCredit && coinCredit.amount > 0 ? coinCredit : null;

  useEffect(() => {
    if (!visible) return;
    if (!isSignedIn) {
      void guestFreeHintsLeft().then(setGuestLeft);
      return;
    }
    void refreshWallet();
  }, [visible, isSignedIn, refreshWallet]);

  const hintsLeft = wallet?.freeHintsLeft ?? 0;
  const hintsCap = wallet?.freeHintsPerDay ?? 1;
  const gamesDone = wallet?.gamesRewarded ?? 0;
  const gamesCap = wallet?.gamesRewardCap ?? 8;
  const pollsDone = wallet?.momentsRewarded ?? 0;
  const pollsCap = wallet?.momentsRewardCap ?? 10;

  return (
    <BottomSheetShell visible={visible} onClose={onClose} title={t("walletTitle")}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
      >
        {isSignedIn ? (
          <>
            <View style={styles.balanceCard}>
              <CoinIcon size={36} />
              <View style={{ flex: 1 }}>
                <Text style={[type.metadata, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>
                  {t("yourBalance")}
                </Text>
                <Text style={[type.stats, { color: colors.lime, fontSize: 32, lineHeight: 38 }]}>
                  {wallet?.balance ?? 0}
                </Text>
              </View>
            </View>
            {credited ? (
              <View style={styles.creditBanner} accessibilityLiveRegion="polite">
                <CoinIcon size={16} />
                <Text style={[type.button, { color: colors.ink, fontFamily: ui.bodyBold }]}>
                  {fill(t("coinsEarnedLine"), { count: credited.amount })}
                </Text>
              </View>
            ) : null}

            <Text style={[type.metadata, styles.section, { fontFamily: ui.bodyMedium }]}>
              {t("todayProgress")}
            </Text>
            <View style={styles.card}>
              <ProgressRow
                icon="bulb-outline"
                iconColor="#F5C842"
                title={t("progressFreeHints")}
                ratio={fill(t("progressRatio"), { done: hintsLeft, cap: hintsCap })}
                detail={fill(t("hintsLeftToday"), { count: hintsLeft })}
                fonts={ui}
              />
              <ProgressRow
                icon="game-controller-outline"
                iconColor={colors.pink}
                title={t("progressGames")}
                ratio={fill(t("progressRatio"), { done: gamesDone, cap: gamesCap })}
                progress={gamesCap > 0 ? gamesDone / gamesCap : 0}
                fillColor={colors.lime}
                fonts={ui}
              />
              <ProgressRow
                icon="stats-chart-outline"
                iconColor="#A78BFA"
                title={t("progressPolls")}
                ratio={fill(t("progressRatio"), { done: pollsDone, cap: pollsCap })}
                progress={pollsCap > 0 ? pollsDone / pollsCap : 0}
                fillColor={colors.pink}
                fonts={ui}
              />
            </View>
          </>
        ) : (
          <GuestGate
            title={t("signInToEarn")}
            message={fill(t("guestHintsLeft"), { count: guestLeft })}
            actionLabel={onSignIn ? t("signInToEarnCta") : undefined}
            onSignIn={onSignIn}
          >
            {!onSignIn ? (
              <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{t("signInAfterGame")}</Text>
            ) : null}
          </GuestGate>
        )}

        <Text style={[type.metadata, styles.section, { fontFamily: ui.bodyMedium }]}>{t("earnTitle")}</Text>
        <View style={styles.card}>
          <EarnRow
            icon="calendar-outline"
            iconColor={colors.limeLive}
            title={t("earnStreakTitle")}
            body={t("earnStreak")}
            fonts={ui}
          />
          <EarnRow
            icon="game-controller-outline"
            iconColor={colors.pink}
            title={t("earnGameTitle")}
            body={t("earnGame")}
            fonts={ui}
          />
          <EarnRow
            icon="stats-chart-outline"
            iconColor="#A78BFA"
            title={t("earnPollTitle")}
            body={t("earnPoll")}
            fonts={ui}
          />
        </View>
      </ScrollView>
    </BottomSheetShell>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  scrollInner: { gap: spacing.sm, paddingBottom: spacing.sm },
  section: { color: colors.lilac, letterSpacing: 1, marginTop: spacing.xs },
  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  creditBanner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  card: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.md,
  },
  progressRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  progressIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBody: { flex: 1, gap: 4 },
  progressHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(245, 240, 255, 0.08)",
    overflow: "hidden",
    marginTop: 2,
  },
  fill: { height: "100%", borderRadius: radius.pill },
  earnRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
});
