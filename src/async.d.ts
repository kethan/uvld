// uvld/async — optional, await-aware validation entry point.
import type {
  Context, Issue, Refinement, ValidationResult, SafeParseReturn
} from './index.js';

/** The core context plus cancellation controls, threaded through every validator. */
export interface AsyncContext extends Context {
  /** Honour this in your own async work (e.g. pass to `fetch`). */
  signal?: AbortSignal;
  /** Absolute epoch ms; `withTimeout` and `race` use it to bound work. */
  deadline?: number;
}
export interface AsyncOptions {
  signal?: AbortSignal;
  /** Whole-validation timeout in milliseconds. */
  timeout?: number;
}
export type AsyncValidationResult = ValidationResult | Promise<ValidationResult>;
export type AsyncRefinement = (value: any, context?: AsyncContext) => AsyncValidationResult;
export type AsyncValidator<T = unknown> = AsyncRefinement & { readonly _output?: T };
/** Anything the async kernel can call: a sync core schema or an async validator. */
export type AnyValidator = Refinement | AsyncValidator<any>;
export type AsyncShape = Record<string, AnyValidator>;
export type AsyncAction = AsyncRefinement | ((value: any, context?: AsyncContext) => any);
export type TransformAction = ((value: any, context?: AsyncContext) => any)
  & { readonly _transform: true };

// --- entry points ----------------------------------------------------------
export function evaluateAsync(
  schema: AnyValidator, value: unknown, options?: AsyncOptions
): Promise<{ issues: Issue[]; data: unknown }>;
export function parseAsync<T>(
  schema: AnyValidator, value: unknown, options?: AsyncOptions
): Promise<T>;
export function safeParseAsync<T>(
  schema: AnyValidator, value: unknown, options?: AsyncOptions
): Promise<SafeParseReturn<T>>;
export function isAsync(
  schema: AnyValidator, value: unknown, options?: AsyncOptions
): Promise<boolean>;

// --- async-aware combinators ----------------------------------------------
export function customAsync<T = unknown>(
  validate: (value: any, context?: AsyncContext) => boolean | Promise<boolean>,
  message?: string,
  validations?: AsyncRefinement[]
): AsyncValidator<T>;
export function objectAsync<T = unknown>(
  shape: AsyncShape, message?: string, validations?: AsyncRefinement[], exact?: boolean
): AsyncValidator<T>;
export function strictAsync<T = unknown>(
  shape: AsyncShape, message?: string, validations?: AsyncRefinement[]
): AsyncValidator<T>;
export function arrayAsync<T = unknown>(
  schema: AnyValidator, message?: string, validations?: AsyncRefinement[]
): AsyncValidator<T>;
export function tupleAsync<T = unknown>(
  schemas: AnyValidator[], message?: string, validations?: AsyncRefinement[]
): AsyncValidator<T>;
export function orAsync(...schemas: AnyValidator[]): AsyncValidator<any>;
export function andAsync(...schemas: AnyValidator[]): AsyncValidator<any>;
export function optionalAsync<T = unknown>(
  schema: AnyValidator, message?: string, validations?: AsyncRefinement[]
): AsyncValidator<T>;
export function nullableAsync<T = unknown>(
  schema: AnyValidator, message?: string, validations?: AsyncRefinement[]
): AsyncValidator<T>;

// --- check / transform actions ---------------------------------------------
export function checkAsync(
  fn: (value: any, context?: AsyncContext) => boolean | Promise<boolean>,
  message?: string
): AsyncRefinement;
export function rawCheckAsync(
  fn: (value: any, context?: AsyncContext) => AsyncValidationResult
): AsyncRefinement;
export function transformAsync(
  fn: (value: any, context?: AsyncContext) => any
): TransformAction;
export function pipeAsync<T = unknown>(
  schema: AnyValidator, ...actions: AsyncAction[]
): AsyncValidator<T>;
export function fallbackAsync<T = unknown>(
  schema: AnyValidator,
  value: T | ((input: any, context?: AsyncContext) => T | Promise<T>)
): AsyncValidator<T>;
export function messageAsync<T = unknown>(
  schema: AnyValidator, text: string
): AsyncValidator<T>;

// --- helpers ---------------------------------------------------------------
/** Recursively unwraps promises inside plain objects/arrays. */
export type DeepAwaited<T> =
  T extends Promise<infer U> ? DeepAwaited<U>
    : T extends Date | Map<any, any> | Set<any> | RegExp | Error ? T
      : T extends ReadonlyArray<infer U> ? Array<DeepAwaited<U>>
        : T extends object ? { [K in keyof T]: DeepAwaited<T[K]> }
          : T;
/** Recursively awaits promises inside plain objects/arrays; leaves Date/Map/Set alone. */
export function resolveAsync<T>(input: T): Promise<DeepAwaited<T>>;
/** Bounds a promise with a timeout and/or an AbortSignal. */
export function withTimeout<T>(promise: T | Promise<T>, ms?: number, signal?: AbortSignal): Promise<T>;
