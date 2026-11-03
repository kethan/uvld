// uvld/compile — compile a schema into a plain boolean predicate.
import type { SafeParseReturn, Validator } from './index.js';

/** A compiled schema: `true` when the value is valid, `false` otherwise. */
export type Compiled<T = unknown> = (value: unknown) => boolean;

/** A compiled schema with `safeParse`-shaped results. */
export type CompiledParse<T = unknown> = (value: unknown) => SafeParseReturn<T>;

/**
 * Walk a schema once and return a boolean predicate with the structure
 * unrolled: no context objects, no path strings and no issue arrays on the
 * success path. Nodes that cannot be compiled (optional/nullable wrappers with
 * refinements, `or`/`and`/`not`, `lazy`, `transform`, `custom`, user-defined
 * kinds) delegate to the generic validator, so the answer always matches
 * `is(schema, value)`.
 *
 * The predicate is cached per schema object. Schema keys are captured on first
 * use, exactly as they are for the generic validator.
 *
 * Because the tree carries no path strings, a `custom` validator that reads
 * `context.path`/`context.origin` receives a root context (`''`/`'value'`)
 * rather than its position. Validity is otherwise identical to `is()`; use
 * {@link compileParse} when you need real paths in errors.
 */
export function compile<T = unknown>(schema: Validator<T>): Compiled<T>;

/**
 * Like {@link compile}, but returns a `safeParse`-shaped result: success is
 * answered by the compiled predicate, failure re-runs `safeParse()` so the
 * full error is preserved. Schemas the compiler cannot fast-path (a root
 * `transform()`, `lazy()`, `or()`, ...) return `safeParse()` results unchanged.
 */
export function compileParse<T = unknown>(schema: Validator<T>): CompiledParse<T>;
