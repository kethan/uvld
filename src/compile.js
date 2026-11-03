// uvld/compile — turn a schema into a plain boolean predicate.
//
//     import { compile, compileParse } from 'uvld/compile';
//     const valid = compile(User);
//     valid({ name: 'Ada' });            // true, no context/path/issue allocation
//     const parse = compileParse(User);  // same result shape as safeParse
//
// The generic validator is an interpreter: every node allocates a context and
// an issue array, whether or not anything failed. `compile()` walks the schema
// once and returns a closure tree instead — no contexts, no path strings and no
// arrays on the success path.
//
// It answers only "is this value valid". Anything it cannot compile — or/and/
// not, lazy, transform, custom, a schema of your own — delegates to the generic
// validator, so the answer is always the same as `is()`. `compileParse()`
// re-runs `safeParse()` when the predicate rejects, so the rich error (and any
// transformed root value) is preserved.

import { safeParse } from './index.js';

// Refinements are called as (value, context) and may return true, null or
// undefined ("no issue"), an empty Issue[], or a message/partial issue.
const CTX = { path: '', origin: 'value', depth: 0, out: { set: false, value: undefined } };
const passes = r => r === true || r == null || (Array.isArray(r) && r.length === 0);

// The generic validator refuses to descend past depth 64; the compiled tree
// threads the same counter so a cyclic value cannot blow the stack.
const MAX = 64;

// Leaf kinds whose check and refinements are safe to call directly. `custom`
// and user-defined kinds are not here: they may expect a real context.
const leaves = new Set([
  'string', 'boolean', 'number', 'function', 'symbol', 'bigint', 'integer',
  'date', 'promise', 'never', 'any', 'unknown', 'nullish', 'literal',
  'instance', 'enums', 'min', 'max'
]);

// One compiled closure tree per schema object, plus the root entry point that
// seeds the depth counter (so the same predicate is returned every time).
const cache = new WeakMap();
const roots = new WeakMap();

// Unknown node: run the generic validator with the depth the compiled tree has
// reached. Validity is all that is read back, so the context is disposable.
const fallback = schema => {
  const fn = (value, depth) => {
    if (depth > MAX) return false;
    const r = schema(value, { path: '', origin: 'value', depth, out: { set: false, value: undefined } });
    return Array.isArray(r) ? r.length === 0 : r === true || r == null;
  };
  fn.compiled = false;
  return fn;
};

const refinements = list => {
  if (!list.length) return null;
  return value => {
    for (let i = 0; i < list.length; i++) if (!passes(list[i](value, CTX))) return false;
    return true;
  };
};

const node = schema => {
  const hit = cache.get(schema);
  if (hit) return hit;
  const fast = build(schema);
  cache.set(schema, fast);
  return fast;
};

const build = schema => {
  const meta = schema.meta;

  if (!meta) {
    // optional() / nullable(): pass when skipped, otherwise compile the inner
    // schema. With refinements of their own, delegate.
    if (schema.inner && !(schema.refinements && schema.refinements.length)) {
      const inner = node(schema.inner);
      const skip = schema.skip;
      const fn = (value, depth) => skip(value) || inner(value, depth);
      fn.compiled = inner.compiled;
      return fn;
    }
    return fallback(schema);
  }

  const [kind, check, list] = meta;
  const refine = refinements(list);

  if (kind === 'object' || kind === 'record' || kind === 'map' || kind === 'array' ||
      kind === 'set' || kind === 'tuple') {
    return composite(kind, schema, check, refine);
  }

  if (!leaves.has(kind)) return fallback(schema);

  const fn = (value, depth) => {
    if (depth > MAX || !check(value, CTX)) return false;
    return !refine || refine(value);
  };
  fn.compiled = true;
  return fn;
};

const composite = (kind, schema, check, refine) => {
  let fn;

  if (kind === 'array') {
    const sub = node(schema.item);
    fn = (value, depth) => {
      if (depth > MAX || !check(value, CTX)) return false;
      const next = depth + 1;
      for (let i = 0; i < value.length; i++) if (!sub(value[i], next)) return false;
      return !refine || refine(value);
    };
  } else if (kind === 'set') {
    const sub = node(schema.item);
    fn = (value, depth) => {
      if (depth > MAX || !check(value, CTX)) return false;
      const next = depth + 1;
      for (const item of value) if (!sub(item, next)) return false;
      return !refine || refine(value);
    };
  } else if (kind === 'tuple') {
    const subs = schema.items.map(node);
    const n = subs.length;
    fn = (value, depth) => {
      if (depth > MAX || !Array.isArray(value) || value.length !== n) return false;
      const next = depth + 1;
      for (let i = 0; i < n; i++) if (!subs[i](value[i], next)) return false;
      return !refine || refine(value);
    };
  } else if (kind === 'object') {
    const [keys, validators] = schema.shape();
    const subs = validators.map(node);
    const n = keys.length;
    // Same own-property rule as the generic walk: an inherited value can never
    // satisfy a key.
    const own = Object.hasOwn;
    // strict(): no own key outside the shape.
    if (schema.exact) {
      const known = new Set(keys);
      const ownKeys = Reflect.ownKeys;
      fn = (value, depth) => {
        if (depth > MAX || !check(value, CTX)) return false;
        const ks = ownKeys(value);
        for (let i = 0; i < ks.length; i++) if (!known.has(ks[i])) return false;
        const next = depth + 1;
        for (let i = 0; i < n; i++) {
          if (!subs[i](own(value, keys[i]) ? value[keys[i]] : undefined, next)) return false;
        }
        return !refine || refine(value);
      };
    } else {
      fn = (value, depth) => {
        if (depth > MAX || !check(value, CTX)) return false;
        const next = depth + 1;
        for (let i = 0; i < n; i++) {
          if (!subs[i](own(value, keys[i]) ? value[keys[i]] : undefined, next)) return false;
        }
        return !refine || refine(value);
      };
    }
  } else {
    // record / map: validate every key and every value.
    const [keySchema, valueSchema] = schema.entries;
    const keyNode = node(keySchema);
    const valueNode = node(valueSchema);
    const isMap = kind === 'map';
    fn = (value, depth) => {
      if (depth > MAX || !check(value, CTX)) return false;
      const entries = isMap ? value : Reflect.ownKeys(value);
      const next = depth + 1;
      for (const entry of entries) {
        const k = isMap ? entry[0] : entry;
        if (!keyNode(k, next)) return false;
        if (!valueNode(isMap ? entry[1] : value[k], next)) return false;
      }
      return !refine || refine(value);
    };
  }

  fn.compiled = true;
  return fn;
};

/**
 * Compile a schema into a boolean predicate.
 * The predicate is cached per schema object and is as correct as `is()`:
 * unsupported nodes fall back to the generic validator, and an unexpected
 * throw from user code counts as "invalid", exactly like `safeParse()`.
 */
export function compile(schema) {
  if (typeof schema !== 'function') throw new TypeError('compile() expects a validator');
  let fn = roots.get(schema);
  if (!fn) {
    const fast = node(schema);
    fn = value => {
      try {
        return fast(value, 0);
      } catch {
        return false;
      }
    };
    roots.set(schema, fn);
  }
  return fn;
}

/**
 * Compile a schema into a `safeParse`-shaped function. The predicate answers
 * the common case; a rejection re-runs `safeParse()` for the full error.
 * Schemas that cannot be compiled (a root `transform()`, `lazy()`, `or()`, ...)
 * fall back to `safeParse()` entirely, so the returned data is unchanged.
 */
export function compileParse(schema) {
  if (typeof schema !== 'function') throw new TypeError('compileParse() expects a validator');
  const fast = node(schema);
  if (!fast.compiled) return value => safeParse(schema, value);
  const valid = compile(schema);
  return value => (valid(value) ? { success: true, data: value } : safeParse(schema, value));
}
