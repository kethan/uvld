// index.d.ts

// Define the Issue interface
export interface Issue<T> {
  message: string;
  expected: string;
  received: T;
  path: string;
  origin: string;
}

// Define the Validator type
export type Validator<T> = (
  value: T,
  path?: string,
  origin?: string
) => Issue<T>[] | boolean;

// Utility type to infer the type from a Validator
export type Infer<V> = V extends Validator<infer T> ? T : never;

// Helper type to create an intersection of types
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

// The 'define' function
export function define<T>(
  type: string,
  validate: (value: unknown) => value is T
): (
  message?: string,
  validations?: Validator<T>[]
) => Validator<T>;

// The 'custom' function
export function custom<T = unknown>(
  validate: (value: T) => boolean,
  message?: string,
  validations?: Validator<T>[]
): Validator<T>;

// Basic validators
export const string: (
  message?: string,
  validations?: Validator<string>[]
) => Validator<string>;

export const boolean: (
  message?: string,
  validations?: Validator<boolean>[]
) => Validator<boolean>;

export const number: (
  message?: string,
  validations?: Validator<number>[]
) => Validator<number>;

export const integer: (
  message?: string,
  validations?: Validator<number>[]
) => Validator<number>;

export const func: (
  message?: string,
  validations?: Validator<Function>[]
) => Validator<Function>;

export const symbol: (
  message?: string,
  validations?: Validator<symbol>[]
) => Validator<symbol>;

export const bigint: (
  message?: string,
  validations?: Validator<bigint>[]
) => Validator<bigint>;

// export const nan: (
//   message?: string,
//   validations?: Validator<number>[]
// ) => Validator<number>;

export const date: (
  message?: string,
  validations?: Validator<Date>[]
) => Validator<Date>;

export const promise: <T>(
  message?: string,
  validations?: Validator<Promise<T>>[]
) => Validator<Promise<any>>;

export const never: (
  message?: string,
  validations?: Validator<never>[]
) => Validator<never>;

export const any: (
  message?: string,
  validations?: Validator<any>[]
) => Validator<any>;

export const nullish: (
  message?: string,
  validations?: Validator<null | undefined>[]
) => Validator<null | undefined>;

// Literal validator
export function literal<T extends string | number | boolean | null | undefined>(
  v: T,
  message?: string,
  ...validations: Validator<T>[]
): Validator<T>;

// Instance validator
export function instance<T>(
  ref: new (...args: any[]) => T,
  message?: string,
  ...validations: Validator<T>[]
): Validator<T>;

// Enums validator
export function enums<T extends readonly any[]>(
  values: T,
  message?: string,
  ...validations: Validator<T>[]
): Validator<T[number]>;

// Optional validator
export function optional<T>(
  schema: Validator<T>,
  message?: string,
  ...validations: Validator<T | undefined>[]
): Validator<T | undefined>;

// Nullable validator
export function nullable<T>(
  schema: Validator<T>,
  message?: string,
  ...validations: Validator<T | null>[]
): Validator<T | null>;

// Complex types
export function record<K extends string, V>(
  keySchema: Validator<K>,
  valueSchema: Validator<V>,
  message?: string,
  validations?: Validator<Record<K, V>>[]
): Validator<Record<K, V>>;

export function map<K, V>(
  keySchema: Validator<K>,
  valueSchema: Validator<V>,
  message?: string,
  validations?: Validator<Map<K, V>>[]
): Validator<Map<K, V>>;

export function array<T>(
  schema: Validator<T>,
  message?: string,
  validations?: Validator<T[]>[]
): Validator<T[]>;

export function set<T>(
  schema: Validator<T>,
  message?: string,
  validations?: Validator<Set<T>>[]
): Validator<Set<T>>;

export function object<T extends Record<string, Validator<any>>>(
  schema: T,
  message?: string,
  validations?: Validator<{ [K in keyof T]: Infer<T[K]> }>[],
  exact?: boolean
): Validator<
  { [K in keyof T]: Infer<T[K]> } & { [key: string]: any }
>;

export function strict<T extends Record<string, Validator<any>>>(
  schema: T,
  message?: string,
  validations?: Validator<{ [K in keyof T]: Infer<T[K]> }>[]
): Validator<{ [K in keyof T]: Infer<T[K]> }>;

// Tuple validator
export function tuple<T extends Validator<any>[]>(
  schemas: [...T],
  message?: string,
  validations?: Validator<{ [K in keyof T]: Infer<T[K]> }>[]
): Validator<{ [K in keyof T]: Infer<T[K]> }>;

// Utility functions
export function min<T>(
  minValue: number,
  message?: string,
  validations?: Validator<T[]>[]
): Validator<number | string | any[] | Map<any, any> | Set<any>>;

export function max<T>(
  maxValue: number,
  message?: string,
  validations?: Validator<T[]>[]
): Validator<number | string | any[] | Map<any, any> | Set<any>>;

export function or<T extends Validator<any>[]>(
  ...schemas: T
): Validator<Infer<T[number]>>;

export function and<T extends Validator<any>[]>(
  ...schemas: T
): Validator<UnionToIntersection<Infer<T[number]>>>;

export function lazy<T>(
  resolveSchema: () => Validator<T>
): Validator<T>;

export function transform<T, U>(
  schema: Validator<T>,
  transformer: (value: U) => T
): Validator<U>;

export function not<T>(
  schema: Validator<T>,
  message?: string
): Validator<unknown>;

// Type guard function
export function is<T>(
  schema: Validator<T>,
  value: unknown
): boolean;

// Parse functions
export function parse<T>(
  schema: Validator<T>,
  value: unknown
): T;

export function safeParse<T>(
  schema: Validator<T>,
  value: unknown
): { success: true; data: T } | { success: false; error: VError };

// VError class
export class VError extends Error {
  issues: Issue<unknown>[];
  constructor(message: string, issues?: Issue<unknown>[]);
}