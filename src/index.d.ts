// uvld 1.0.0 — public TypeScript surface.
// Kept in sync with src/index.js by tests/api.spec.ts (export-name check).

/** 'value' for data, 'key' for record/map keys; refinements may set others. */
export type Origin = 'value' | 'key' | (string & {});

/** A single validation failure. `received` is a type tag, never the raw value. */
export interface Issue {
  message: string;
  expected: string;
  received: string;
  /** Unambiguous bracket path, e.g. `["user"]["tags"][0]`; root is `""`. */
  path: string;
  origin: Origin;
}

/** Threaded through every validator; you rarely need to touch it. */
export interface Context {
  path: string;
  origin: Origin;
  depth: number;
  out: { set: boolean; value: unknown };
}

/** A single result; partial issues are filled in with defaults by the library. */
export type RefinementResult = Issue | Partial<Issue> | boolean | string | null | undefined;
/** What a validator or refinement may return. `call()` normalises it to Issue[]. */
export type ValidationResult = RefinementResult | RefinementResult[];

/** A validation function: returns issues (empty = valid), or a normalisable result. */
export type Refinement = (value: any, context?: Context) => ValidationResult;

/**
 * `readonly _output` is a type-only phantom — it is never assigned at runtime.
 * It is what lets `Infer` recover the static type a schema validates.
 */
export type Validator<T = unknown> = Refinement & { readonly _output?: T };

/** `Infer<typeof schema>` — the TypeScript type produced by a schema. */
export type Infer<V> = V extends Validator<infer T> ? T : never;

export type InferShape<T> = { [K in keyof T]: Infer<T[K]> };

export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void ? I : never;

/** `(message?, validations?) => Validator<T>` — uniform across every validator. */
export type ValidatorFactory<T> = (message?: string, validations?: Refinement[]) => Validator<T>;

export type SafeParseReturn<T> =
  | { success: true; data: T }
  | { success: false; error: VError };

// --- extension point -------------------------------------------------------
export function define<T>(
  type: string,
  validate: (value: unknown, context?: Context) => boolean
): ValidatorFactory<T>;

// --- primitives ------------------------------------------------------------
export const string: ValidatorFactory<string>;
export const boolean: ValidatorFactory<boolean>;
/** Finite numbers only: NaN and ±Infinity are rejected. */
export const number: ValidatorFactory<number>;
export const func: ValidatorFactory<Function>;
export const symbol: ValidatorFactory<symbol>;
export const bigint: ValidatorFactory<bigint>;
export const integer: ValidatorFactory<number>;
export const date: ValidatorFactory<Date>;
export const promise: ValidatorFactory<Promise<unknown>>;
export const never: ValidatorFactory<never>;
export const any: ValidatorFactory<any>;
export const unknown: ValidatorFactory<unknown>;
export const nullish: ValidatorFactory<null | undefined>;

// --- literals, classes, enums ----------------------------------------------
export function literal<const T extends string | number | boolean | bigint | symbol | null | undefined>(
  v: T,
  message?: string,
  validations?: Refinement[]
): Validator<T>;

export function instance<T>(
  ref: abstract new (...args: any[]) => T,
  message?: string,
  validations?: Refinement[]
): Validator<T>;

export function enums<const T extends readonly unknown[]>(
  values: T,
  message?: string,
  validations?: Refinement[]
): Validator<T[number]>;

// --- wrappers --------------------------------------------------------------
export function optional<T>(
  schema: Validator<T>,
  message?: string,
  validations?: Refinement[]
): Validator<T | undefined>;

export function nullable<T>(
  schema: Validator<T>,
  message?: string,
  validations?: Refinement[]
): Validator<T | null>;

export function custom<T = unknown>(
  validate: (value: T, context?: Context) => boolean,
  message?: string,
  validations?: Refinement[]
): Validator<T>;

// --- composites ------------------------------------------------------------
export function record<K extends PropertyKey, V>(
  keySchema: Validator<K>,
  valueSchema: Validator<V>,
  message?: string,
  validations?: Refinement[]
): Validator<Record<K, V>>;

export function map<K, V>(
  keySchema: Validator<K>,
  valueSchema: Validator<V>,
  message?: string,
  validations?: Refinement[]
): Validator<Map<K, V>>;

export function array<T>(
  schema: Validator<T>,
  message?: string,
  validations?: Refinement[]
): Validator<T[]>;

export function set<T>(
  schema: Validator<T>,
  message?: string,
  validations?: Refinement[]
): Validator<Set<T>>;

/** Plain objects only; own properties only; extra keys allowed unless `exact`. */
export function object<T extends Record<PropertyKey, Validator<any>>>(
  schema: T,
  message?: string,
  validations?: Refinement[],
  exact?: boolean
): Validator<InferShape<T>>;

/** `object(schema, ..., true)` — rejects unknown own keys (including symbols). */
export function strict<T extends Record<PropertyKey, Validator<any>>>(
  schema: T,
  message?: string,
  validations?: Refinement[]
): Validator<InferShape<T>>;

export function tuple<const T extends readonly Validator<any>[]>(
  schemas: T,
  message?: string,
  validations?: Refinement[]
): Validator<{ [K in keyof T]: Infer<T[K]> }>;

// --- constraints -----------------------------------------------------------
type Sized = number | string | unknown[] | Map<unknown, unknown> | Set<unknown>;
/** number >= bound, or length/size >= bound for string/array/Map/Set. */
export function min(bound: number, message?: string, validations?: Refinement[]): Validator<Sized>;
/** number <= bound, or length/size <= bound for string/array/Map/Set. */
export function max(bound: number, message?: string, validations?: Refinement[]): Validator<Sized>;

// --- combinators -----------------------------------------------------------
export function or<const T extends readonly Validator<any>[]>(...schemas: T): Validator<Infer<T[number]>>;
export function and<const T extends readonly Validator<any>[]>(
  ...schemas: T
): Validator<UnionToIntersection<Infer<T[number]>>>;
export function not(
  schema: Validator<any>,
  message?: string,
  validations?: Refinement[]
): Validator<unknown>;
export function lazy<T>(resolve: () => Validator<T>): Validator<T>;
/**
 * Validate `fn(value)` instead of `value`. At the root of parse/safeParse the
 * returned data is `fn(value)` (applied exactly once). Nested transforms
 * affect validation only. Annotate the callback parameter for type inference.
 */
export function transform<T, U = unknown>(
  schema: Validator<T>,
  fn: (value: U) => T
): Validator<T>;

// --- entry points ----------------------------------------------------------
export function is<T>(schema: Validator<T>, value: unknown): value is T;
export function parse<T>(schema: Validator<T>, value: unknown): T;
export function safeParse<T>(schema: Validator<T>, value: unknown): SafeParseReturn<T>;

export class VError extends Error {
  issues: Issue[];
  constructor(message: string, issues?: Issue[]);
}
