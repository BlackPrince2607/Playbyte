import { EventBus } from "../analytics/bus";
import { GameEvent, STREAK_THRESHOLD, StandardEventType } from "../analytics/events";
import { ContentBundle } from "../content/types";
import { SessionClock } from "../core/clock";
import { GameDefinition } from "../core/definition";
import { GameEngine, ReduceContext, ReduceResult } from "../core/engine";
import { Rng, createRng } from "../core/rng";
import { ActionOutcome, EngineResult, Hint, Json } from "../core/types";
import { RoundSummary, nextLevel } from "../difficulty/controllers";
import { completeRound, emptyPerformance, recordOutcome } from "../difficulty/performance";
import { GameSession, MAX_ACTION_LOG, MAX_ROUND_RECORDS, RoundRecord, SessionStatus } from "./types";

export type RunnerOptions<S, A, P> = {
  engine: GameEngine<S, A, P>;
  definition: GameDefinition;
  content: ContentBundle;
  gameKey: string;
  sessionId: string;
  seed: string;
  clock: SessionClock;
  bus?: EventBus;
  wallClock?: () => number;
  /** Player's remembered level for this engine/variation; overrides definition.difficulty.start. */
  startLevel?: number;
  /** Engine's comfortable response time, used by speed-aware difficulty controllers. */
  targetResponseMs?: number;
  restore?: GameSession;
};

export type SessionSnapshot<S> = {
  status: SessionStatus;
  state: S;
  round: number;
  totalRounds: number | null;
  score: number;
  streak: number;
  lives?: number;
  deadline?: number;
  level: number;
  hints: Hint[];
  /** Latest graded outcome; `seq` changes on every new outcome so UIs can trigger feedback. */
  lastOutcome?: ActionOutcome & { seq: number };
  result?: EngineResult;
  error?: string;
};

export type DispatchResult = { accepted: true } | { accepted: false; reason: string };

type Meta = Omit<GameSession, "engineState">;

/**
 * Drives one play session of any engine: round loop, adaptive difficulty, scoring clamp,
 * standard analytics, pause/resume and serialization. Pure TypeScript; the UI subscribes to it.
 */
export class SessionRunner<S, A, P> {
  private state: S;
  private meta: Meta;
  private readonly rng: Rng;
  private readonly wall: () => number;
  private readonly maxScore: number;
  private roundOutcomes: ActionOutcome[] = [];
  private outcomeSeq = 0;
  private lastOutcome?: ActionOutcome & { seq: number };
  private statusBeforePause: SessionStatus | null = null;
  private error?: string;
  private listeners = new Set<() => void>();
  private snap!: SessionSnapshot<S>;

  constructor(private readonly opts: RunnerOptions<S, A, P>) {
    const { engine, definition, restore, seed } = opts;
    this.wall = opts.wallClock ?? (() => Date.now());
    this.rng = createRng(seed);
    this.maxScore = definition.maxScore ?? engine.maxScore(definition);

    if (restore) {
      const r = engine.restore(restore.engineState);
      if (!r.ok) throw new Error(`Session restore failed: ${r.error}`);
      this.state = r.value;
      const { engineState: _engineState, ...rest } = restore;
      const live = rest.status === "playing" || rest.status === "roundOver";
      this.meta = { ...rest, status: live ? "paused" : rest.status };
      if (live) this.statusBeforePause = rest.status;
      opts.clock.pause();
      this.refresh(false);
      this.emit("GAME_RESTORED", { fromStatus: rest.status });
      return;
    }

    const d = definition.difficulty;
    const level = Math.min(d.max, Math.max(d.min, opts.startLevel ?? d.start));
    const now = opts.clock.now();
    let state = engine.init({ def: definition, seed, content: opts.content, now }, this.rng.fork("init"));
    state = engine.generateRound(state, {
      rng: this.rng.fork(`round:${engine.progress(state).round + 1}`),
      params: engine.difficulty.paramsFor(level),
      level,
      now,
    });
    this.state = state;
    const startedAt = this.wall();
    this.meta = {
      schemaVersion: 1,
      sessionId: opts.sessionId,
      gameKey: opts.gameKey,
      engineId: engine.meta.id,
      engineVersion: engine.meta.version,
      variation: definition.variation,
      category: definition.category,
      seed,
      definition,
      status: "ready",
      round: 0,
      totalRounds: null,
      score: 0,
      streak: 0,
      activeElapsedMs: 0,
      difficulty: { level, history: [{ round: 1, level }] },
      performance: emptyPerformance(),
      actions: [],
      actionCount: 0,
      startedAt,
      updatedAt: startedAt,
      contentSource: opts.content.source,
    };
    this.refresh(false);
  }

  // ---- external store API (useSyncExternalStore) ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot<S> => this.snap;

  get engine(): GameEngine<S, A, P> {
    return this.opts.engine;
  }

  get sessionId(): string {
    return this.meta.sessionId;
  }

  get durationMs(): number {
    return this.opts.clock.now();
  }

  get rounds(): RoundRecord[] {
    return this.meta.rounds ?? [];
  }

  // ---- lifecycle ----
  start(): void {
    if (this.meta.status !== "ready") return;
    this.opts.clock.resume();
    this.meta.status = "playing";
    this.emit("GAME_STARTED", { level: this.meta.difficulty.level, contentSource: this.meta.contentSource });
    this.emit("ROUND_STARTED", { level: this.meta.difficulty.level });
    this.checkStatus();
    this.refresh();
  }

  dispatch(action: A): DispatchResult {
    if (this.meta.status !== "playing") return { accepted: false, reason: `not playing (${this.meta.status})` };
    return this.guard(() => {
      const check = this.opts.engine.validate(this.state, action);
      if (!check.valid) return { accepted: false, reason: check.reason };
      const res = this.opts.engine.reduce(this.state, action, this.ctx());
      this.logAction(action);
      const type = action && typeof action === "object" && "type" in action ? String((action as { type: unknown }).type) : "action";
      this.emit("ACTION_PERFORMED", { action: type });
      this.apply(res);
      return { accepted: true };
    });
  }

  tick(): void {
    const tick = this.opts.engine.tick;
    if (!tick || this.meta.status !== "playing") return;
    this.guard(() => {
      const res = tick.call(this.opts.engine, this.state, this.ctx());
      if (res.state === this.state && !res.outcome && !res.events?.length) return { accepted: true };
      this.apply(res);
      return { accepted: true };
    });
  }

  useHint(hintId: string): DispatchResult {
    const applyHint = this.opts.engine.applyHint;
    if (!applyHint || this.meta.status !== "playing") return { accepted: false, reason: "hints unavailable" };
    if (!this.opts.engine.hints(this.state).some((h) => h.id === hintId)) return { accepted: false, reason: "unknown hint" };
    return this.guard(() => {
      const res = applyHint.call(this.opts.engine, this.state, hintId, this.ctx());
      this.meta.performance = { ...this.meta.performance, hintsUsed: this.meta.performance.hintsUsed + 1 };
      this.emit("HINT_USED", { hint: hintId });
      this.apply(res);
      return { accepted: true };
    });
  }

  /** Starts the next round after a roundOver pause. */
  advance(): void {
    if (this.meta.status !== "roundOver") return;
    this.guard(() => {
      const { engine } = this.opts;
      const level = this.meta.difficulty.level;
      this.state = engine.generateRound(this.state, {
        rng: this.rng.fork(`round:${engine.progress(this.state).round + 1}`),
        params: engine.difficulty.paramsFor(level),
        level,
        now: this.opts.clock.now(),
      });
      this.meta.status = "playing";
      this.emit("ROUND_STARTED", { level });
      this.checkStatus();
      this.refresh();
      return { accepted: true };
    });
  }

  pause(): void {
    if (this.meta.status !== "playing" && this.meta.status !== "roundOver") return;
    this.statusBeforePause = this.meta.status;
    this.meta.status = "paused";
    this.opts.clock.pause();
    this.emit("GAME_PAUSED");
    this.refresh();
  }

  resume(): void {
    if (this.meta.status !== "paused") return;
    this.meta.status = this.statusBeforePause ?? "playing";
    this.statusBeforePause = null;
    this.opts.clock.resume();
    this.emit("GAME_RESUMED");
    this.refresh();
  }

  /** Player chose to end: the current score counts (endless games end this way). */
  end(): void {
    if (this.isFinal()) return;
    this.complete();
    this.refresh();
  }

  /** Player left without finishing: nothing is submitted. */
  abandon(): void {
    if (this.isFinal()) return;
    this.meta.status = "abandoned";
    this.meta.completedAt = this.wall();
    this.meta.result = this.clampedResult();
    this.opts.clock.pause();
    this.emit("GAME_ABANDONED", { score: this.meta.result.score });
    this.refresh();
  }

  serialize(): GameSession {
    return {
      ...this.meta,
      activeElapsedMs: this.opts.clock.now(),
      engineState: this.opts.engine.serialize(this.state),
    };
  }

  // ---- internals ----
  private isFinal() {
    return this.meta.status === "completed" || this.meta.status === "abandoned";
  }

  private ctx(): ReduceContext {
    const n = this.meta.actionCount++;
    return { now: this.opts.clock.now(), rng: this.rng.fork(`a:${n}`) };
  }

  private guard(fn: () => DispatchResult): DispatchResult {
    try {
      return fn();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.emit("GAME_ERROR", { message: this.error.slice(0, 200) });
      this.refresh();
      return { accepted: false, reason: "engine_error" };
    }
  }

  private logAction(action: A) {
    this.meta.actions.push({ t: this.opts.clock.now(), a: action as unknown as Json });
    if (this.meta.actions.length > MAX_ACTION_LOG) this.meta.actions.splice(0, this.meta.actions.length - MAX_ACTION_LOG);
  }

  private apply(res: ReduceResult<S>) {
    this.state = res.state;
    for (const ev of res.events ?? []) this.emit("ENGINE", ev.props, ev.name);
    if (res.outcome) this.recordOutcome(res.outcome);
    this.checkStatus();
    this.refresh();
  }

  private recordOutcome(o: ActionOutcome) {
    const before = this.meta.performance.streak;
    this.meta.performance = recordOutcome(this.meta.performance, o);
    this.roundOutcomes.push(o);
    this.lastOutcome = { ...o, seq: ++this.outcomeSeq };
    const props = { correct: o.correct, responseMs: Math.round(o.responseMs), points: o.points ?? 0 };
    this.emit("ANSWER_SUBMITTED", props);
    this.emit(o.correct ? "ANSWER_CORRECT" : "ANSWER_WRONG", props);
    const after = this.meta.performance.streak;
    if (after === STREAK_THRESHOLD && before < STREAK_THRESHOLD) this.emit("STREAK_STARTED", { streak: after });
    if (after === 0 && before >= STREAK_THRESHOLD) this.emit("STREAK_BROKEN", { streak: before });
  }

  private roundSummary(): RoundSummary {
    const n = this.roundOutcomes.length;
    return {
      attempts: n,
      correct: this.roundOutcomes.filter((o) => o.correct).length,
      avgResponseMs: n ? this.roundOutcomes.reduce((s, o) => s + o.responseMs, 0) / n : 0,
    };
  }

  private checkStatus() {
    const s = this.opts.engine.status(this.state);
    if (s === "gameOver") this.complete();
    else if (s === "roundOver" && this.meta.status === "playing") this.finishRound();
  }

  private recordRound(summary: RoundSummary, round: number, skipEmpty = false) {
    const rounds = this.meta.rounds ?? [];
    if (rounds.length >= MAX_ROUND_RECORDS) return;
    const banked = rounds.reduce((s, r) => s + r.points, 0);
    const score = Math.max(0, Math.min(this.maxScore, Math.round(this.opts.engine.progress(this.state).score)));
    const points = score - banked;
    if (skipEmpty && points === 0 && summary.attempts === 0) return;
    this.meta.rounds = [...rounds, { round, points, correct: summary.correct, attempts: summary.attempts }];
  }

  private finishRound() {
    const summary = this.roundSummary();
    const round = this.opts.engine.progress(this.state).round;
    this.recordRound(summary, round);
    this.meta.performance = completeRound(this.meta.performance);
    this.emit("ROUND_COMPLETED", { ...summary, avgResponseMs: Math.round(summary.avgResponseMs) });
    const prev = this.meta.difficulty.level;
    const level = nextLevel(this.meta.definition.difficulty, {
      level: prev,
      perf: this.meta.performance,
      round: summary,
      targetResponseMs: this.opts.targetResponseMs,
    });
    if (level !== prev) {
      this.meta.difficulty = { level, history: [...this.meta.difficulty.history, { round: round + 1, level }].slice(-50) };
      this.emit("DIFFICULTY_CHANGED", { from: prev, to: level });
    }
    this.roundOutcomes = [];
    this.meta.status = "roundOver";
  }

  private clampedResult(): EngineResult {
    const r = this.opts.engine.result(this.state);
    return { ...r, score: Math.max(0, Math.min(this.maxScore, Math.round(r.score))) };
  }

  private complete() {
    if (this.isFinal()) return;
    const summary = this.roundSummary();
    const round = this.opts.engine.progress(this.state).round;
    if (!this.meta.rounds?.some((r) => r.round === round)) this.recordRound(summary, round, true);
    if (this.roundOutcomes.length) {
      this.emit("ROUND_COMPLETED", { ...summary, avgResponseMs: Math.round(summary.avgResponseMs) });
      this.roundOutcomes = [];
    }
    this.meta.status = "completed";
    this.meta.completedAt = this.wall();
    this.meta.result = this.clampedResult();
    this.opts.clock.pause();
    this.emit("GAME_COMPLETED", {
      score: this.meta.result.score,
      correct: this.meta.result.correct,
      attempts: this.meta.result.attempts,
      durationMs: Math.round(this.opts.clock.now()),
      level: this.meta.difficulty.level,
    });
  }

  private refresh(notify = true) {
    const p = this.opts.engine.progress(this.state);
    this.meta.round = p.round;
    this.meta.totalRounds = p.totalRounds;
    this.meta.score = Math.max(0, Math.min(this.maxScore, Math.round(p.score)));
    this.meta.streak = p.streak;
    this.meta.lives = p.lives;
    this.meta.deadline = p.deadline;
    this.meta.activeElapsedMs = this.opts.clock.now();
    this.meta.updatedAt = this.wall();
    this.snap = {
      status: this.meta.status,
      state: this.state,
      round: p.round,
      totalRounds: p.totalRounds,
      score: this.meta.score,
      streak: p.streak,
      lives: p.lives,
      deadline: p.deadline,
      level: this.meta.difficulty.level,
      hints: this.meta.status === "playing" ? this.opts.engine.hints(this.state) : [],
      lastOutcome: this.lastOutcome,
      result: this.meta.result,
      error: this.error,
    };
    if (notify) for (const l of this.listeners) l();
  }

  private emit(type: StandardEventType | "ENGINE", props?: Record<string, Json>, name?: string) {
    const bus = this.opts.bus;
    if (!bus) return;
    const event: GameEvent = {
      type,
      name,
      sessionId: this.meta?.sessionId ?? this.opts.sessionId,
      gameKey: this.opts.gameKey,
      engineId: this.opts.engine.meta.id,
      engineVersion: this.opts.engine.meta.version,
      variation: this.opts.definition.variation,
      category: this.opts.definition.category,
      round: this.opts.engine.progress(this.state).round,
      seed: this.opts.seed,
      clockMs: Math.round(this.opts.clock.now()),
      ts: this.wall(),
      props,
    };
    bus.emit(event);
  }
}
