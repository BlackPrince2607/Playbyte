import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { useLanguage } from "../context/LanguageContext";
import type { CoinPack } from "../lib/economy";
import { fill } from "../i18n/strings";
import { loadStorePrices, purchasesAvailable, buyProduct } from "../lib/purchases";
import { guestFreeHintsLeft } from "../lib/storage";
import { syncPurchase } from "../lib/walletApi";
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

export function WalletSheet({ visible, onClose, onSignIn }: Props) {
  const { isSignedIn } = useAuth();
  const { wallet, applyWallet, refreshWallet, coinCredit } = useApp();
  const { t, fonts: ui } = useLanguage();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [guestLeft, setGuestLeft] = useState(0);
  const storeReady = purchasesAvailable();
  const credited = visible && coinCredit && coinCredit.amount > 0 ? coinCredit : null;

  useEffect(() => {
    if (!visible) return;
    setError("");
    if (!isSignedIn) {
      void guestFreeHintsLeft().then(setGuestLeft);
      return;
    }
    void refreshWallet();
  }, [visible, isSignedIn, refreshWallet]);

  useEffect(() => {
    if (!visible || !isSignedIn || !storeReady) return;
    const ids = wallet?.packs.map((pack) => pack.id) ?? [];
    if (ids.length === 0) return;
    void loadStorePrices(ids).then(setPrices);
  }, [visible, isSignedIn, storeReady, wallet?.packs]);

  async function buy(pack: CoinPack) {
    if (busy) return;
    setBusy(pack.id);
    setError("");
    try {
      const transactionId = await buyProduct(pack.id);
      if (!transactionId) return;
      const next = await syncPurchase(pack.id, transactionId);
      applyWallet(next, next.coinsEarned ?? 0, "purchase");
    } catch (e) {
      if (e instanceof Error && (e.message === "unavailable" || e.message === "unverified")) {
        setError(t("purchasesUnavailable"));
      } else {
        setError(isApiError(e) ? e.userMessage : t("purchaseFailed"));
      }
    } finally {
      setBusy(null);
    }
  }

  const packs = wallet?.packs ?? [];

  return (
    <BottomSheetShell visible={visible} onClose={onClose} title={t("walletTitle")}>
      {isSignedIn ? (
        <>
          <Text style={[type.metadata, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>{t("yourBalance")}</Text>
          <View style={styles.balanceRow}>
            <CoinIcon size={28} />
            <Text style={[type.stats, { color: colors.lime }]}>{wallet?.balance ?? 0}</Text>
          </View>
          {credited ? (
            <View style={styles.creditBanner} accessibilityLiveRegion="polite">
              <CoinIcon size={16} />
              <Text style={[type.button, { color: colors.ink, fontFamily: ui.bodyBold }]}>
                {fill(t("coinsEarnedLine"), { count: credited.amount })}
              </Text>
            </View>
          ) : null}
          <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>
            {fill(t("freeHintsLine"), { count: wallet?.freeHintsLeft ?? 0 })}
          </Text>
          <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>
            {fill(t("earnProgressGames"), {
              done: wallet?.gamesRewarded ?? 0,
              cap: wallet?.gamesRewardCap ?? 8,
            })}
          </Text>
          <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>
            {fill(t("earnProgressPolls"), {
              done: wallet?.momentsRewarded ?? 0,
              cap: wallet?.momentsRewardCap ?? 10,
            })}
          </Text>
        </>
      ) : (
        <GuestGate
          title={t("signInToEarn")}
          message={fill(t("guestHintsLeft"), { count: guestLeft })}
          actionLabel={onSignIn ? t("signInToBuy") : undefined}
          onSignIn={onSignIn}
        >
          {!onSignIn ? (
            <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{t("signInAfterGame")}</Text>
          ) : null}
        </GuestGate>
      )}

      <Text style={[type.metadata, styles.section, { fontFamily: ui.bodyMedium }]}>{t("earnTitle")}</Text>
      <Text style={[type.bodySm, styles.earn, { fontFamily: ui.body }]}>{t("earnStreak")}</Text>
      <Text style={[type.bodySm, styles.earn, { fontFamily: ui.body }]}>{t("earnGame")}</Text>
      <Text style={[type.bodySm, styles.earn, { fontFamily: ui.body }]}>{t("earnPoll")}</Text>

      {isSignedIn ? (
        <ScrollView style={styles.packs} contentContainerStyle={{ gap: spacing.sm }}>
          <Text style={[type.metadata, { color: colors.lilac, fontFamily: ui.bodyMedium }]}>{t("buyCoins")}</Text>
          {!storeReady ? (
            <Text style={[type.bodySm, { color: colors.lilac, fontFamily: ui.body }]}>{t("purchasesUnavailable")}</Text>
          ) : null}
          {packs.map((pack) => {
            const price = prices[pack.id] || pack.displayPrice;
            return (
              <Pressable
                key={pack.id}
                accessibilityRole="button"
                disabled={!storeReady || busy !== null}
                onPress={() => void buy(pack)}
                style={({ pressed }) => [styles.pack, pressed && storeReady && { opacity: 0.8 }]}
              >
                <CoinIcon size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.button, { color: colors.paper, fontFamily: ui.bodyBold }]}>
                    {fill(t("packCoins"), { count: pack.coins })}
                  </Text>
                  {pack.bestValue ? (
                    <Text style={[type.micro, { color: colors.lime }]}>{t("bestValue")}</Text>
                  ) : null}
                </View>
                {busy === pack.id ? (
                  <ActivityIndicator color={colors.lime} size="small" />
                ) : (
                  <Text style={[type.button, { color: colors.lime, fontFamily: ui.bodyBold }]}>{price}</Text>
                )}
              </Pressable>
            );
          })}
          {error ? <Text style={[type.bodySm, { color: colors.pinkSoft, fontFamily: ui.body }]}>{error}</Text> : null}
        </ScrollView>
      ) : null}
    </BottomSheetShell>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.lilac, marginTop: spacing.sm },
  earn: { color: colors.paper },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  packs: { maxHeight: 280 },
  pack: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
});
