/** Minimal engine used to test the SessionRunner itself: guess whether a number is even. */
import { GameEngine } from "../core/engine";
import { Json, err, invalid, ok, valid } from "../core/types";

export type DemoState = { v: 1; round: number; total: number; n: number; score: number; streak: number; answered: boolean; roundStart: number };
export type DemoAction = { type: "answer"; even: boolean };

export const demoEngine: GameEngine<DemoState, DemoAction, { max: number }> = {
  meta: {
    id: "demo",
    title: "Demo",
    version: 1,
    interaction: "choice",
    scoreDirection: "higher_is_better",
    variations: [{ id: "even", title: "Even or odd" }],
  },
  difficulty: {
    dimensions: [{ key: "max", label: "Largest number", easy: 10, hard: 1000 }],
    paramsFor: (level) => ({ max: Math.round(10 + 990 * level) }),
    defaultController: "staircase",
  },
  checkDefinition: (def) => (def.variation === "even" ? ok(def) : err("unknown variation")),
  contentNeeds: () => [],
  maxScore: (def) => (def.roundCount ?? 5) * 10,
  init: (ctx) => ({ v: 1, round: 0, total: ctx.def.roundCount ?? 5, n: 0, score: 0, streak: 0, answered: false, roundStart: ctx.now }),
  generateRound: (s, ctx) => ({ ...s, round: s.round + 1, n: ctx.rng.int(1, ctx.params.max), answered: false, roundStart: ctx.now }),
  validate: (s, a) => (s.answered ? invalid("already answered") : a.type === "answer" ? valid : invalid("bad action")),
  reduce: (s, a, ctx) => {
    const correct = (s.n % 2 === 0) === a.even;
    const points = correct ? 10 : 0;
    return {
      state: { ...s, answered: true, score: s.score + points, streak: correct ? s.streak + 1 : 0 },
      outcome: { correct, responseMs: ctx.now - s.roundStart, points },
      events: [{ name: "demo_answer", props: { n: s.n } }],
    };
  },
  hints: () => [],
  status: (s) => (!s.answered ? "playing" : s.round >= s.total ? "gameOver" : "roundOver"),
  progress: (s) => ({ round: s.round, totalRounds: s.total, score: s.score, streak: s.streak }),
  result: (s) => ({ score: s.score, correct: s.score / 10, attempts: s.round }),
  serialize: (s) => s as unknown as Json,
  restore: (json) => {
    const s = json as unknown as DemoState;
    return s && typeof s === "object" && !Array.isArray(s) && s.v === 1 ? ok(s) : err("bad state");
  },
};
