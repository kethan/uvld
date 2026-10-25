// uvld/utils — declarations for the optional, tree-shakeable entry point.
import type { Validator, Context, ValidationResult } from './index.js';

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
export const integer: Format;
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
export const transform: typeof import('./index.js').transform;

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
