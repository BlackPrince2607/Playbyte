import { api } from "../api";
import type { WalletSnapshot } from "./economy";

export type HintSpend = WalletSnapshot & { free: boolean; coinsSpent: number };

export function fetchWallet() {
  return api<WalletSnapshot>("/v1/me/wallet");
}

export function claimStreak(body: { migrateCount?: number; migrateDate?: string }) {
  return api<WalletSnapshot>("/v1/me/streak/claim", {
    method: "POST",
    body: JSON.stringify({
      migrateCount: body.migrateCount,
      migrateDate: body.migrateDate,
    }),
  });
}

export function spendHint(engine: string, hintId: string, idempotencyKey: string) {
  return api<HintSpend>("/v1/me/hints/spend", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ engine, hintId }),
  });
}

export function buyFreeze(idempotencyKey: string) {
  return api<WalletSnapshot>("/v1/me/streak/freeze", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function syncPurchase(productId: string, transactionId: string) {
  return api<WalletSnapshot>("/v1/me/purchases/sync", {
    method: "POST",
    body: JSON.stringify({ productId, transactionId }),
  });
}
