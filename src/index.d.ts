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

// --- optional utilities ----------------------------------------------------
// Shipped in the same entry point as the core (no `uvld/utils` import needed).
// `integerCheck` is the utilities' `integer` check; the core `integer()` schema
// factory keeps its name. Every factory below is lazy, so unused utilities are
// tree-shaken like unused core schemas.
/** A check usable standalone, in a core `validations` array, or inside `pipe`. */
export type Check<T = unknown> = (value: T, context?: Context) => ValidationResult;
/** A transform action, consumed by `pipe()` or core `transform(schema, action)`. */
export type TransformAction<T = any, U = any> = ((value: T) => U) & { readonly _transform: true };
export type Action<T = any> = Check<T> | TransformAction<T, any>;

/** `(message?) => Check` — string format validators. */
export type Format = (message?: string) => Check<unknown>;
/** `(bound, message?) => Check` — exact / min / max / not constraints. */
export type Bound = (bound: number, message?: string) => Check<unknown>;
/** `() => TransformAction` — string transforms. */
export type TextTransform = () => TransformAction<any, string>;
/** Metadata decorator: `title(schema, value)` or a `pipe` action `title(value)`. */
export type Meta = {
  <T>(schema: Validator<T>, value: unknown): Validator<T>;
  (value: unknown): Action;
};

// --- format / string validators -------------------------------------------
export const base64: Format;
export const bic: Format;
export const cuid2: Format;
export const creditCard: Format;
export const decimal: Format;
export const digits: Format;
export const domain: Format;
export const email: Format;
export const rfcEmail: Format;
export const emoji: Format;
export const hexadecimal: Format;
export const hexColor: Format;
export const imei: Format;
export const ip: Format;
export const ipv4: Format;
export const ipv6: Format;
export const isbn: Format;
export const isrc: Format;
export const isoDate: Format;
export const isoDateTime: Format;
export const isoDateTimeSecond: Format;
export const isoTime: Format;
export const isoTimeSecond: Format;
export const isoTimestamp: Format;
export const isoWeek: Format;
export const jwsCompact: Format;
export const ksuid: Format;
export const mac: Format;
export const mac48: Format;
export const mac64: Format;
export const mimeType: Format;
export const octal: Format;
export const slug: Format;
export const ulid: Format;
export const url: Format;
export const uuid: Format;
export const nanoid: (size?: number, message?: string) => Check<unknown>;
export const hash: (algorithm?: string, message?: string) => Check<unknown>;

// --- numbers, emptiness, membership ---------------------------------------
export const finite: Format;
export const integerCheck: Format;
export const safeInteger: Format;
export const empty: Format;
export const nonEmpty: Format;
export const multipleOf: (divisor: number, message?: string) => Check<unknown>;
export const value: (expected: unknown, message?: string) => Check<unknown>;
export const notValue: (expected: unknown, message?: string) => Check<unknown>;
export const values: (list: readonly unknown[], message?: string) => Check<unknown>;
export const notValues: (list: readonly unknown[], message?: string) => Check<unknown>;
export const includes: (needle: unknown, message?: string) => Check<unknown>;
export const excludes: (needle: unknown, message?: string) => Check<unknown>;
export const startsWith: (prefix: string, message?: string) => Check<unknown>;
export const endsWith: (suffix: string, message?: string) => Check<unknown>;
export const regex: (re: RegExp, message?: string) => Check<unknown>;

// --- length / size / count / value constraints -----------------------------
export const length: Bound;
export const minLength: Bound;
export const maxLength: Bound;
export const notLength: Bound;
export const bytes: Bound;
export const minBytes: Bound;
export const maxBytes: Bound;
export const notBytes: Bound;
export const codePoints: Bound;
export const minCodePoints: Bound;
export const maxCodePoints: Bound;
export const notCodePoints: Bound;
export const graphemes: Bound;
export const minGraphemes: Bound;
export const maxGraphemes: Bound;
export const notGraphemes: Bound;
export const words: Bound;
export const minWords: Bound;
export const maxWords: Bound;
export const notWords: Bound;
export const size: Bound;
export const minSize: Bound;
export const maxSize: Bound;
export const notSize: Bound;
export const entries: Bound;
export const minEntries: Bound;
export const maxEntries: Bound;
export const notEntries: Bound;
export const minValue: Bound;
export const maxValue: Bound;
export const gtValue: Bound;
export const ltValue: Bound;

// --- generic checks and guards ---------------------------------------------
export const check: <T = unknown>(fn: (value: T) => boolean, message?: string) => Check<T>;
export const rawCheck: (fn: (value: any, context?: Context) => ValidationResult) => Check;
export const guard: <T>(schema: Validator<T>) => (value: unknown) => value is T;
export const partialCheck: (
  shape: Record<string, Validator<any>>,
  fn: (value: any) => boolean,
  message?: string
) => Check;
export const everyItem: (fn: (item: any) => boolean, message?: string) => Check<unknown>;
export const someItem: (fn: (item: any) => boolean, message?: string) => Check<unknown>;
export const checkItems: (schema: Validator<any>, message?: string) => Check<unknown>;

// --- transform actions -----------------------------------------------------
export const trim: TextTransform;
export const trimStart: TextTransform;
export const trimEnd: TextTransform;
export const toLowerCase: TextTransform;
export const toUpperCase: TextTransform;
export const toCamelCase: TextTransform;
export const toPascalCase: TextTransform;
export const toKebabCase: TextTransform;
export const toSnakeCase: TextTransform;
export const normalize: (form?: string) => TransformAction<any, string>;
export const toNumber: () => TransformAction<any, number>;
export const toBoolean: () => TransformAction<any, boolean>;
export const parseBoolean: () => TransformAction<any, boolean>;
export const toBigint: () => TransformAction<any, bigint>;
export const toDate: () => TransformAction<any, Date>;
export const toString: () => TransformAction<any, string>;
export const toMinValue: (min: number) => TransformAction<any, number>;
export const toMaxValue: (max: number) => TransformAction<any, number>;
export const parseJson: (reviver?: (key: string, value: any) => any) => TransformAction<any, any>;
export const stringifyJson: (replacer?: any, space?: string | number) => TransformAction<any, string>;
export const rawTransform: <T, U>(fn: (value: T) => U) => TransformAction<T, U>;
export const mapItems: (fn: (item: any, index: number) => any) => TransformAction<any, any[]>;
export const filterItems: (fn: (item: any, index: number) => boolean) => TransformAction<any, any[]>;
export const sortItems: (cmp?: (a: any, b: any) => number) => TransformAction<any, any[]>;
export const reduceItems: (fn: (acc: any, item: any, index: number) => any, initial: any) => TransformAction<any, any>;
export const findItem: (fn: (item: any, index: number) => boolean) => TransformAction<any, any>;

// --- composition / metadata ------------------------------------------------
export const pipe: <T>(schema: Validator<T>, ...actions: Action[]) => Validator<T>;
export const title: Meta;
export const description: Meta;
export const metadata: Meta;
export const examples: Meta;
export const brand: Meta;
export const flavor: Meta;
export const readonly: <T>(schema: Validator<T>) => Validator<T>;
export const args: (...schemas: Validator<any>[]) => Validator<any[]>;
export const returns: <T>(schema: Validator<T>) =>
  <A extends any[], R>(fn: (...args: A) => R) => (...args: A) => R;

// --- production-gap additions ----------------------------------------------
/** Extra string formats. */
export const alpha: Format;
export const alphaNumeric: Format;
export const lowercase: Format;
export const uppercase: Format;
export const ascii: Format;
export const semver: Format;
export const json: Format;
/** Numeric / date shorthand constraints. */
export const positive: Format;
export const negative: Format;
export const nonNegative: Format;
export const nonPositive: Format;
export const inRange: (min: number, max: number, message?: string) => Check<unknown>;
export const minDate: (bound: Date | string | number, message?: string) => Check<unknown>;
export const maxDate: (bound: Date | string | number, message?: string) => Check<unknown>;
/** Collection checks / transforms. */
export const uniqueItems: Format;
export const toUnique: () => TransformAction<any, any[]>;
export const compactItems: () => TransformAction<any, any[]>;
export const reverseItems: () => TransformAction<any, any[]>;
/** Extra string transforms. */
export const toTitleCase: TextTransform;
export const truncate: (max: number, suffix?: string) => TransformAction<any, string>;
export const padStart: (length: number, fill?: string) => TransformAction<any, string>;
export const padEnd: (length: number, fill?: string) => TransformAction<any, string>;
export const replace: (search: string | RegExp, replacement: string) => TransformAction<any, string>;
/** Schema helpers: defaults, message overrides, nullish rejection, errors. */
export const fallback: <T>(schema: Validator<T>, value: T) => Validator<T>;
export const message: <T>(schema: Validator<T>, text: string) => Validator<T>;
export const nonNullable: <T>(schema: Validator<T>, message?: string) => Validator<T>;
export const nonOptional: <T>(schema: Validator<T>, message?: string) => Validator<T>;
export const nonNullish: <T>(schema: Validator<T>, message?: string) => Validator<T>;
/** `{ path: messages[] }` map from an Issue[] or VError. */
export const flatten: (source: Issue[] | { issues: Issue[] }) => Record<string, string[]>;
