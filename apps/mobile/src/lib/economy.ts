/** Display prices. The server decides what is actually charged. */

export const FREE_HINTS_PER_DAY = 3;

const LIGHT = 15;
const MEDIUM = 25;
const STRONG = 40;

export type CoinPack = {
  id: string;
  coins: number;
  displayPrice: string;
  bestValue: boolean;
};

export type MilestonePreview = { day: number; bonus: number };

export type WalletSnapshot = {
  balance: number;
  streak: number;
  bestStreak: number;
  freezes: number;
  freeHintsLeft: number;
  freeHintsPerDay: number;
  freezeCost: number;
  todayReward: number;
  streakClaimed: boolean;
  nextMilestone: MilestonePreview | null;
  gamesRewarded: number;
  gamesRewardCap: number;
  momentsRewarded: number;
  momentsRewardCap: number;
  packs: CoinPack[];
  coinsEarned?: number;
  freezeUsed?: boolean;
};

export type CoinCreditReason = "game" | "moment" | "streak" | "purchase" | "reward";

/** One on-screen credit event (toast + wallet pulse). `id` forces re-animation. */
export type CoinCredit = {
  amount: number;
  reason: CoinCreditReason;
  id: number;
};

/** Coin cost of a hint after the free daily allowance. Null when this hint is not sold. */
export function hintCoinCost(engine: string, hintId: string): number | null {
  const id = engine.replace(/-/g, "_");
  if (hintId === "clue") return LIGHT;
  if (hintId === "fifty") return MEDIUM;
  if (hintId === "path") return STRONG;
  if (hintId === "reveal") {
    if (id === "word_search") return MEDIUM;
    return STRONG;
  }
  return null;
}
