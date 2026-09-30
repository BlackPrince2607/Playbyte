import type { Rng } from "../../../core/rng";
import type { QuizParams, QuizQuestion } from "../../quiz/logic/types";

/** A property most numbers share; `near` produces a number that breaks it but looks plausible. */
type NumberRule = {
  id: string;
  tier: 0 | 1 | 2;
  describe: string;
  hint: string;
  has(n: number): boolean;
  member(rng: Rng, max: number): number;
  near(rng: Rng, max: number): number;
};

const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
const isSquare = (n: number) => Number.isInteger(Math.sqrt(n));

function multiple(n: number, tier: 0 | 1 | 2): NumberRule {
  return {
    id: `mult${n}`,
    tier,
    describe: `multiples of ${n}`,
    hint: `Try dividing by ${n}`,
    has: (x) => x % n === 0,
    member: (rng, max) => n * rng.int(1, Math.max(2, Math.floor(max / n))),
    near: (rng, max) => n * rng.int(1, Math.max(2, Math.floor(max / n))) + (rng.chance(0.5) ? 1 : -1) * rng.int(1, Math.min(2, n - 1)),
  };
}

export const NUMBER_RULES: NumberRule[] = [
  {
    id: "even",
    tier: 0,
    describe: "even numbers",
    hint: "Odd or even?",
    has: (x) => x % 2 === 0,
    member: (rng, max) => 2 * rng.int(1, Math.floor(max / 2)),
    near: (rng, max) => 2 * rng.int(1, Math.floor(max / 2)) - 1,
  },
  {
    id: "odd",
    tier: 0,
    describe: "odd numbers",
    hint: "Odd or even?",
    has: (x) => x % 2 === 1,
    member: (rng, max) => 2 * rng.int(1, Math.floor(max / 2)) - 1,
    near: (rng, max) => 2 * rng.int(1, Math.floor(max / 2)),
  },
  multiple(5, 0),
  multiple(10, 0),
  multiple(3, 1),
  multiple(4, 1),
  multiple(6, 1),
  multiple(7, 2),
  multiple(9, 2),
  {
    id: "square",
    tier: 2,
    describe: "perfect squares",
    hint: "Think of a number times itself",
    has: isSquare,
    member: (rng, max) => rng.int(2, Math.max(3, Math.floor(Math.sqrt(max)))) ** 2,
    near: (rng, max) => rng.int(2, Math.max(3, Math.floor(Math.sqrt(max)))) ** 2 + (rng.chance(0.5) ? 1 : -1),
  },
  {
    id: "prime",
    tier: 2,
    describe: "prime numbers",
    hint: "Can any of them be divided evenly?",
    has: isPrime,
    member: (rng, max) => {
      for (;;) {
        const n = rng.int(2, max);
        if (isPrime(n)) return n;
      }
    },
    // Odd composites (9, 15, 21, 25...) are the convincing impostors.
    near: (rng, max) => {
      for (;;) {
        const n = 2 * rng.int(4, Math.max(5, Math.floor(max / 2))) + 1;
        if (!isPrime(n)) return n;
      }
    },
  },
];

const tierFor = (d: number): 0 | 1 | 2 => (d < 0.35 ? 0 : d < 0.6 ? 1 : 2);

/** Procedural numbers strategy: rule tier and number range grow with difficulty. */
export function numbersQuestion(rng: Rng, params: QuizParams, round: number): QuizQuestion {
  const tier = tierFor(params.targetDifficulty);
  const current = NUMBER_RULES.filter((r) => r.tier === tier);
  const easier = NUMBER_RULES.filter((r) => r.tier < tier);
  const rule = rng.pick(easier.length && rng.chance(0.3) ? easier : current);
  const max = Math.round(20 + params.targetDifficulty * 130);
  const k = Math.max(2, params.optionCount - 1);

  const members = new Set<number>();
  for (let guard = 0; members.size < k && guard < 500; guard++) {
    const n = rule.member(rng, max);
    if (n > 0 && rule.has(n)) members.add(n);
  }
  let odd = rule.near(rng, max);
  for (let guard = 0; (odd <= 0 || rule.has(odd) || members.has(odd)) && guard < 500; guard++) odd = rule.near(rng, max);

  const answerId = `n${round}-odd`;
  return {
    id: `num-${round}-${rule.id}`,
    prompt: "Which number doesn't fit?",
    clues: [
      { kind: "text", value: "One of these breaks the pattern" },
      { kind: "text", value: rule.hint },
    ],
    options: rng.shuffle([
      ...[...members].map((n, i) => ({ id: `n${round}-${i}`, label: String(n) })),
      { id: answerId, label: String(odd) },
    ]),
    answerId,
    explanation: `The others are all ${rule.describe}; ${odd} isn't.`,
  };
}
