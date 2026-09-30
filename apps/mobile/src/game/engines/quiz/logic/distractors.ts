import type { Rng } from "../../../core/rng";
import type { PoolItem, QuizOption } from "./types";

export const normLabel = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * DistractorGenerator: picks `count` wrong answers for `answer`.
 * `similarity` (0..1) is the chance each slot is filled from the answer's own group (and from
 * editor-provided `attrs.distractors`), so higher levels offer more confusable options.
 */
export function pickDistractors(answer: PoolItem, pool: PoolItem[], count: number, similarity: number, rng: Rng): QuizOption[] {
  const taken = new Set([normLabel(answer.answer), ...(answer.aliases ?? []).map(normLabel)]);
  const out: QuizOption[] = [];
  const add = (id: string, label: string) => {
    const n = normLabel(label);
    if (!n || taken.has(n) || out.length >= count) return false;
    taken.add(n);
    out.push({ id, label });
    return true;
  };

  const explicit = Array.isArray(answer.attrs?.distractors)
    ? rng.shuffle((answer.attrs!.distractors as unknown[]).filter((d): d is string => typeof d === "string"))
    : [];
  const others = pool.filter((p) => p.id !== answer.id);
  const same = rng.shuffle(others.filter((p) => answer.group !== undefined && p.group === answer.group));
  const rest = rng.shuffle(others.filter((p) => answer.group === undefined || p.group !== answer.group));

  while (out.length < count && (explicit.length || same.length || rest.length)) {
    const close = rng.chance(similarity);
    if (close && explicit.length) {
      const d = explicit.shift()!;
      add(`d:${normLabel(d)}`, d);
    } else if (close && same.length) {
      const p = same.shift()!;
      add(p.id, p.answer);
    } else if (rest.length) {
      const p = rest.shift()!;
      add(p.id, p.answer);
    } else if (same.length) {
      const p = same.shift()!;
      add(p.id, p.answer);
    } else {
      const d = explicit.shift()!;
      add(`d:${normLabel(d)}`, d);
    }
  }
  return out;
}

/** Picks an unused item near the target difficulty (small random window for variety). */
export function pickItem(pool: PoolItem[], used: ReadonlySet<string>, target: number, rng: Rng): PoolItem | null {
  const fresh = pool.filter((p) => !used.has(p.id));
  const candidates = fresh.length ? fresh : pool;
  if (!candidates.length) return null;
  const ranked = candidates
    .map((p) => ({ p, d: Math.abs(p.difficulty - target) + rng.next() * 0.15 }))
    .sort((a, b) => a.d - b.d);
  return ranked[rng.int(0, Math.min(3, ranked.length) - 1)].p;
}
