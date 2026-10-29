import { Platform } from "react-native";

type StoreProduct = { identifier: string; priceString: string };

type PurchasesApi = {
  setLogLevel: (level: string) => Promise<void> | void;
  configure: (opts: { apiKey: string; appUserID?: string }) => void;
  logIn: (appUserID: string) => Promise<unknown>;
  getProducts: (ids: string[]) => Promise<StoreProduct[]>;
  purchaseStoreProduct: (product: StoreProduct) => Promise<{
    transaction?: { transactionIdentifier?: string };
  }>;
  logOut: () => Promise<unknown>;
};

type Sdk = { Purchases: PurchasesApi; LOG_LEVEL?: { DEBUG: string; INFO: string } };

let configured = false;
let configuredFor: string | null = null;

function sdkKey(): string | null {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() || null;
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim() || null;
  return null;
}

function loadSdk(): Sdk | null {
  try {
    // Loaded only when a purchase runs, so tests and builds without the native module still start.
    const mod = require("react-native-purchases") as { default?: PurchasesApi; LOG_LEVEL?: Sdk["LOG_LEVEL"] } & PurchasesApi;
    const Purchases = mod.default ?? mod;
    if (typeof Purchases.configure !== "function") return null;
    return { Purchases, LOG_LEVEL: mod.LOG_LEVEL };
  } catch {
    return null;
  }
}

export function purchasesAvailable(): boolean {
  return Boolean(sdkKey()) && loadSdk() !== null;
}

export async function initPurchases(userId: string): Promise<void> {
  const key = sdkKey();
  const sdk = loadSdk();
  if (!key || !sdk) return;
  try {
    if (!configured) {
      if (sdk.LOG_LEVEL) await sdk.Purchases.setLogLevel(__DEV__ ? sdk.LOG_LEVEL.DEBUG : sdk.LOG_LEVEL.INFO);
      sdk.Purchases.configure({ apiKey: key, appUserID: userId });
      configured = true;
      configuredFor = userId;
      return;
    }
    if (configuredFor === userId) return;
    await sdk.Purchases.logIn(userId);
    configuredFor = userId;
  } catch {
    /* A build without the native store billing module can still earn and spend coins. */
  }
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  const sdk = loadSdk();
  configuredFor = null;
  try {
    await sdk?.Purchases.logOut();
  } catch {
    /* The next sign-in calls logIn with the new account. */
  }
}

export function purchaseCancelled(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "userCancelled" in err && (err as { userCancelled?: boolean }).userCancelled);
}

export async function loadStorePrices(productIds: string[]): Promise<Record<string, string>> {
  const sdk = loadSdk();
  if (!sdk || !sdkKey() || productIds.length === 0) return {};
  try {
    const products = await sdk.Purchases.getProducts(productIds);
    const prices: Record<string, string> = {};
    for (const product of products) prices[product.identifier] = product.priceString;
    return prices;
  } catch {
    return {};
  }
}

/** Store transaction id after a successful consumable purchase. Null when the person cancels. */
export async function buyProduct(productId: string): Promise<string | null> {
  const sdk = loadSdk();
  const key = sdkKey();
  if (!sdk || !key) {
    throw new Error("unavailable");
  }
  const products = await sdk.Purchases.getProducts([productId]);
  const product = products.find((item) => item.identifier === productId) ?? products[0];
  if (!product) throw new Error("unavailable");
  try {
    const result = await sdk.Purchases.purchaseStoreProduct(product);
    const transactionId = result.transaction?.transactionIdentifier;
    if (!transactionId) throw new Error("unverified");
    return transactionId;
  } catch (err) {
    if (purchaseCancelled(err)) return null;
    throw err;
  }
}
