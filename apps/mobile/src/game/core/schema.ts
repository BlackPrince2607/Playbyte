/**
 * Minimal runtime validation for configs and content (avoids a schema-library dependency).
 * Each validator returns Result<T> with a path-qualified error message.
 */
import { Result, err, ok } from "./types";

export type Validator<T> = (value: unknown, path?: string) => Result<T>;

const at = (path: string | undefined, msg: string) => `${path ?? "value"}: ${msg}`;

export const v = {
  string(opts: { min?: number; max?: number } = {}): Validator<string> {
    return (x, p) => {
      if (typeof x !== "string") return err(at(p, "expected string"));
      const s = x.trim();
      if (opts.min !== undefined && s.length < opts.min) return err(at(p, `shorter than ${opts.min}`));
      if (opts.max !== undefined && s.length > opts.max) return err(at(p, `longer than ${opts.max}`));
      return ok(s);
    };
  },
  number(opts: { min?: number; max?: number; int?: boolean } = {}): Validator<number> {
    return (x, p) => {
      if (typeof x !== "number" || !Number.isFinite(x)) return err(at(p, "expected number"));
      if (opts.int && !Number.isInteger(x)) return err(at(p, "expected integer"));
      if (opts.min !== undefined && x < opts.min) return err(at(p, `below ${opts.min}`));
      if (opts.max !== undefined && x > opts.max) return err(at(p, `above ${opts.max}`));
      return ok(x);
    };
  },
  boolean(): Validator<boolean> {
    return (x, p) => (typeof x === "boolean" ? ok(x) : err(at(p, "expected boolean")));
  },
  literal<T extends string>(...allowed: T[]): Validator<T> {
    return (x, p) =>
      typeof x === "string" && (allowed as string[]).includes(x)
        ? ok(x as T)
        : err(at(p, `expected one of ${allowed.join(", ")}`));
  },
  array<T>(item: Validator<T>, opts: { min?: number; max?: number } = {}): Validator<T[]> {
    return (x, p) => {
      if (!Array.isArray(x)) return err(at(p, "expected array"));
      if (opts.min !== undefined && x.length < opts.min) return err(at(p, `needs at least ${opts.min} items`));
      if (opts.max !== undefined && x.length > opts.max) return err(at(p, `allows at most ${opts.max} items`));
      const out: T[] = [];
      for (let i = 0; i < x.length; i++) {
        const r = item(x[i], `${p ?? "value"}[${i}]`);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return ok(out);
    };
  },
  optional<T>(inner: Validator<T>): Validator<T | undefined> {
    return (x, p) => (x === undefined || x === null ? ok(undefined) : inner(x, p));
  },
  withDefault<T>(inner: Validator<T>, fallback: T): Validator<T> {
    return (x, p) => (x === undefined || x === null ? ok(fallback) : inner(x, p));
  },
  record(): Validator<Record<string, unknown>> {
    return (x, p) =>
      x && typeof x === "object" && !Array.isArray(x) ? ok(x as Record<string, unknown>) : err(at(p, "expected object"));
  },
  object<S extends Record<string, Validator<unknown>>>(
    shape: S,
  ): Validator<{ [K in keyof S]: S[K] extends Validator<infer T> ? T : never }> {
    return (x, p) => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return err(at(p, "expected object"));
      const src = x as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const r = shape[key](src[key], p ? `${p}.${key}` : key);
        if (!r.ok) return r;
        if (r.value !== undefined) out[key] = r.value;
      }
      return ok(out as { [K in keyof S]: S[K] extends Validator<infer T> ? T : never });
    };
  },
};
