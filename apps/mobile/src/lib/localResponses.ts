import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CrowdSnapshot, FeedItem, FeedMoment } from "../api";

const KEY = "maja_local_responses";

/** Bump the chosen option so poll % bars update before the server round-trip. */
export function scoreLocalVote(moment: FeedMoment, optionId: string): FeedMoment {
  const base = moment.result;
  const optionCounts: Record<string, number> = { ...(base?.optionCounts ?? {}) };
  optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1;
  const result: CrowdSnapshot = {
    totalResponses: (base?.totalResponses ?? 0) + 1,
    optionCounts,
    volumeState: base?.volumeState,
    joinedLastMinute: base?.joinedLastMinute,
    correctOptionId: base?.correctOptionId,
  };
  return { ...moment, myOptionId: optionId, result };
}

/** Restore a stored pick without inventing a new crowd vote (hydrate / already-synced). */
export function attachLocalAnswer(moment: FeedMoment, optionId: string): FeedMoment {
  if (moment.myOptionId) return moment;
  if (!moment.options.some((o) => o.id === optionId)) return moment;
  return {
    ...moment,
    myOptionId: optionId,
    result: moment.result ?? { totalResponses: 0, optionCounts: {} },
  };
}

export function withLocalAnswers(items: FeedItem[], answers: Record<string, string>): FeedItem[] {
  if (!Object.keys(answers).length) return items;
  return items.map((item) => {
    if (item.type !== "moment") return item;
    const optionId = answers[item.id];
    return optionId ? attachLocalAnswer(item, optionId) : item;
  });
}

export async function getLocalResponses(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveLocalResponse(momentId: string, optionId: string): Promise<void> {
  const current = await getLocalResponses();
  if (current[momentId] === optionId) return;
  current[momentId] = optionId;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}

export async function removeLocalResponse(momentId: string): Promise<void> {
  const current = await getLocalResponses();
  if (!(momentId in current)) return;
  delete current[momentId];
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}
