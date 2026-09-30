import type { ContentItem } from "../../../content/types";
import type { Rng } from "../../../core/rng";
import { normLabel } from "../../quiz/logic/distractors";
import type { BuildContext, PoolItem, QuizOption, QuizQuestion } from "../../quiz/logic/types";

export type Member = { label: string; emoji?: string };

/** `word_group` item -> pool entry. With `requireEmoji`, groups lacking a full emoji set are skipped. */
export function groupToPool(requireEmoji: boolean) {
  return (item: ContentItem): PoolItem | null => {
    const members = item.attributes.members;
    const emoji = item.attributes.emoji;
    if (!item.answer || !Array.isArray(members) || members.length < 4 || !members.every((m) => typeof m === "string")) return null;
    const hasEmoji = Array.isArray(emoji) && emoji.length === members.length && emoji.every((e) => typeof e === "string" && e);
    if (requireEmoji && !hasEmoji) return null;
    return {
      id: item.id,
      answer: item.answer,
      group: item.distractorGroup,
      difficulty: item.difficulty,
      clues: [],
      attrs: hasEmoji ? { members, emoji } : { members },
    };
  };
}

export function membersOf(p: PoolItem): Member[] {
  const labels = (p.attrs?.members as string[] | undefined) ?? [];
  const emoji = p.attrs?.emoji as string[] | undefined;
  return labels.map((label, i) => ({ label, emoji: emoji?.[i] }));
}

/**
 * DistractorGenerator for Odd One Out: the odd card comes from a *related* group (same family,
 * e.g. fruits vs vegetables) with probability `similarity`, otherwise from an unrelated one.
 */
export function pickOddGroup(base: PoolItem, pool: PoolItem[], similarity: number, rng: Rng): PoolItem | null {
  const others = pool.filter((p) => p.id !== base.id);
  const near = others.filter((p) => base.group !== undefined && p.group === base.group);
  const far = others.filter((p) => base.group === undefined || p.group !== base.group);
  const src = rng.chance(similarity) && near.length ? near : far.length ? far : near;
  return src.length ? rng.pick(src) : null;
}

export function groupBuild(prompt: string, showLabels: boolean) {
  return ({ item, pool, params, rng }: BuildContext): QuizQuestion | null => {
    const k = Math.max(2, params.optionCount - 1);
    const members = membersOf(item);
    if (members.length < k) return null;
    const other = pickOddGroup(item, pool, params.similarity, rng);
    if (!other) return null;
    const taken = new Set(members.map((m) => normLabel(m.label)));
    const oddChoices = membersOf(other).filter((m) => !taken.has(normLabel(m.label)));
    if (!oddChoices.length) return null;
    const odd = rng.pick(oddChoices);
    const opt = (id: string, m: Member): QuizOption => ({ id, label: showLabels || !m.emoji ? m.label : "", emoji: m.emoji, alt: m.label });
    const chosen = rng.sample(members.map((m, i) => ({ m, i })), k);
    const answerId = `${other.id}#odd`;
    return {
      id: `${item.id}>${other.id}`,
      prompt,
      clues: [
        { kind: "text", value: "One of these doesn't belong" },
        { kind: "text", value: `Most of these are: ${item.answer}` },
      ],
      options: rng.shuffle([...chosen.map(({ m, i }) => opt(`${item.id}#${i}`, m)), opt(answerId, odd)]),
      answerId,
      explanation: `${odd.label} belongs to ${other.answer}. The rest are ${item.answer}.`,
    };
  };
}
