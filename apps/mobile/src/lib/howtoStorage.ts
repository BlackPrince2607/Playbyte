import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (engineId: string) => `maja_howto_seen:${engineId}`;

/** Pure gate: show post-play teach only when the engine has HowTo and the user hasn't seen it. */
export function shouldOfferPostPlayHowTo(opts: { hasHowTo: boolean; alreadySeen: boolean }): boolean {
  return opts.hasHowTo && !opts.alreadySeen;
}

export async function hasSeenEngineHowTo(engineId: string): Promise<boolean> {
  if (!engineId) return true;
  return (await AsyncStorage.getItem(keyFor(engineId))) === "1";
}

export async function markEngineHowToSeen(engineId: string): Promise<void> {
  if (!engineId) return;
  await AsyncStorage.setItem(keyFor(engineId), "1");
}
