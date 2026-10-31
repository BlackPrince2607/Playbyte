import type { Rng } from "../../../core/rng";
import type { QuizParams, QuizQuestion } from "../../quiz/logic/types";

export type Op = "+" | "-" | "×" | "÷";

type Problem = {
  expression: string;
  answer: number;
  hint: string;
  /** Common wrong answers from typical mistakes — used as high-quality distractors. */
  traps: number[];
};

const YES = "yes";
const NO = "no";

/** Difficulty band: 0 easy → 4 hard. Driven by staircase `targetDifficulty`. */
export function bandFor(d: number): 0 | 1 | 2 | 3 | 4 {
  if (d < 0.2) return 0;
  if (d < 0.4) return 1;
  if (d < 0.6) return 2;
  if (d < 0.8) return 3;
  return 4;
}

function addSub(rng: Rng, max: number, allowSub: boolean): Problem {
  const a = rng.int(1, max);
  const b = rng.int(1, max);
  if (allowSub && rng.chance(0.5)) {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return {
      expression: `${hi} − ${lo}`,
      answer: hi - lo,
      hint: "Subtract the smaller from the larger",
      traps: [hi + lo, hi - lo + 1, hi - lo - 1, Math.abs(hi - lo * 2)].filter((n) => n !== hi - lo),
    };
  }
  return {
    expression: `${a} + ${b}`,
    answer: a + b,
    hint: "Add them up",
    traps: [a + b + 1, a + b - 1, Math.abs(a - b), a * b].filter((n) => n !== a + b),
  };
}

function mul(rng: Rng, aMax: number, bMax: number): Problem {
  const a = rng.int(2, aMax);
  const b = rng.int(2, bMax);
  return {
    expression: `${a} × ${b}`,
    answer: a * b,
    hint: "Times tables help here",
    traps: [a * b + a, a * b - a, a * (b + 1), (a + 1) * b, a + b].filter((n) => n !== a * b),
  };
}

function div(rng: Rng, quotMax: number, divisorMax: number): Problem {
  const b = rng.int(2, divisorMax);
  const q = rng.int(2, quotMax);
  const a = b * q;
  return {
    expression: `${a} ÷ ${b}`,
    answer: q,
    hint: "How many times does it go in?",
    traps: [q + 1, q - 1, a - b, b, a / Math.max(1, b - 1)].map((n) => Math.round(n)).filter((n) => n !== q && Number.isFinite(n)),
  };
}

/** Two-step: (a±b)×c or a×b±c — forces order-of-ops thinking. */
function twoStep(rng: Rng, band: number): Problem {
  if (rng.chance(0.5)) {
    const a = rng.int(1, 9 + band * 2);
    const b = rng.int(1, 9 + band);
    const c = rng.int(2, 4 + band);
    const inner = rng.chance(0.55) ? a + b : Math.max(a, b) - Math.min(a, b);
    const op: Op = a + b === inner ? "+" : "−";
    const left = op === "+" ? `${a} + ${b}` : `${Math.max(a, b)} − ${Math.min(a, b)}`;
    const answer = inner * c;
    return {
      expression: `(${left}) × ${c}`,
      answer,
      hint: "Do the brackets first",
      traps: [a + b * c, (a + b) + c, inner * (c + 1), inner + c, a * b * c].filter((n) => n !== answer),
    };
  }
  const a = rng.int(2, 6 + band);
  const b = rng.int(2, 6 + band);
  const c = rng.int(1, 12 + band * 3);
  const product = a * b;
  const add = rng.chance(0.6);
  const answer = add ? product + c : product - c;
  if (answer <= 0) {
    return {
      expression: `${a} × ${b} + ${c}`,
      answer: product + c,
      hint: "Multiply, then add",
      traps: [a * (b + c), a + b + c, product - c, product + c + 1].filter((n) => n !== product + c),
    };
  }
  return {
    expression: add ? `${a} × ${b} + ${c}` : `${a} × ${b} − ${c}`,
    answer,
    hint: add ? "Multiply, then add" : "Multiply, then subtract",
    traps: [a * (b + c), a + b + c, product, answer + 1, answer - 1].filter((n) => n !== answer),
  };
}

export function makeProblem(rng: Rng, difficulty: number): Problem {
  const band = bandFor(difficulty);
  if (band === 0) return addSub(rng, 10, true);
  if (band === 1) return rng.chance(0.55) ? addSub(rng, 20, true) : mul(rng, 5, 9);
  if (band === 2) {
    const roll = rng.next();
    if (roll < 0.35) return mul(rng, 9, 9);
    if (roll < 0.6) return div(rng, 9, 9);
    if (roll < 0.8) return addSub(rng, 40, true);
    return mul(rng, 12, 9);
  }
  if (band === 3) {
    const roll = rng.next();
    if (roll < 0.4) return twoStep(rng, 1);
    if (roll < 0.7) return mul(rng, 12, 12);
    return div(rng, 12, 12);
  }
  // band 4
  const roll = rng.next();
  if (roll < 0.55) return twoStep(rng, 2);
  if (roll < 0.8) return mul(rng, 15, 12);
  return div(rng, 15, 12);
}

/** Build plausible unique distractors; prefer trap mistakes, then nearby integers. */
export function distractors(rng: Rng, answer: number, traps: number[], count: number): number[] {
  const out = new Set<number>();
  const pool = rng.shuffle(traps.filter((n) => Number.isFinite(n) && Number.isInteger(n) && n !== answer && n >= 0));
  for (const t of pool) {
    if (out.size >= count) break;
    out.add(t);
  }
  let delta = 1;
  while (out.size < count && delta < 40) {
    for (const sign of [1, -1] as const) {
      const n = answer + sign * delta;
      if (n >= 0 && n !== answer) out.add(n);
      if (out.size >= count) break;
    }
    delta += 1;
  }
  // Absolute last resort — rare for normal answers.
  while (out.size < count) out.add(answer + out.size + 1);
  return [...out].slice(0, count);
}

function solveQuestion(rng: Rng, params: QuizParams, round: number): QuizQuestion {
  const p = makeProblem(rng, params.targetDifficulty);
  const wrongCount = Math.max(1, params.optionCount - 1);
  const wrong = distractors(rng, p.answer, p.traps, wrongCount);
  const answerId = `m${round}-ok`;
  return {
    id: `solve-${round}-${p.expression}`,
    prompt: "Solve it!",
    clues: [
      { kind: "text", value: p.expression },
      { kind: "text", value: p.hint },
    ],
    options: rng.shuffle([
      { id: answerId, label: String(p.answer) },
      ...wrong.map((n, i) => ({ id: `m${round}-w${i}`, label: String(n) })),
    ]),
    answerId,
    explanation: `${p.expression} = ${p.answer}`,
  };
}

function verifyQuestion(rng: Rng, params: QuizParams, round: number): QuizQuestion {
  const p = makeProblem(rng, params.targetDifficulty);
  const truth = rng.chance(0.5);
  let shown = p.answer;
  if (!truth) {
    const traps = distractors(rng, p.answer, p.traps, 3);
    shown = rng.pick(traps.length ? traps : [p.answer + 1]);
  }
  const answerId = truth ? YES : NO;
  return {
    id: `verify-${round}-${p.expression}-${shown}`,
    prompt: "True or trap?",
    clues: [
      { kind: "text", value: `${p.expression} = ${shown}` },
      { kind: "text", value: truth ? "Looks right…" : "Spot the mistake" },
    ],
    options: [
      { id: YES, label: "True", emoji: "✓" },
      { id: NO, label: "Trap", emoji: "✕" },
    ],
    answerId,
    explanation: truth ? `Yep — ${p.expression} = ${p.answer}` : `Nope — ${p.expression} = ${p.answer}, not ${shown}`,
  };
}

/** Procedural math questions. `mode` selects solve vs true/trap presentation. */
export function mathQuestion(mode: "solve" | "verify") {
  return (rng: Rng, params: QuizParams, round: number): QuizQuestion =>
    mode === "verify" ? verifyQuestion(rng, params, round) : solveQuestion(rng, params, round);
}

export { YES as VERIFY_YES, NO as VERIFY_NO };
