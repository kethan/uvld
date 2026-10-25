// uvld/async — optional async validation entry point.
//
// A separate entry, like uvld/utils: importing it never adds a byte to the
// synchronous core. It has its own await-aware kernel because the core's
// `call()` deliberately normalises results synchronously.
//
// An async validator is `(value, context) => Issue[] | Promise<Issue[]>`.
// Refinements may return true/false, a message, a partial Issue, or Issue[] —
// all of which may also be wrapped in a Promise. The context carries a shared
// `out` box (the same one the core now uses), an optional AbortSignal and a
// deadline.
import { VError } from './index.js';

const root = () => ({
  path: '', origin: 'value', depth: 0,
  out: { set: false, value: undefined },
  signal: undefined, deadline: 0
});
const typeOf = v => v === null ? 'null'
  : typeof v !== 'object' ? typeof v
    : Object.prototype.toString.call(v).slice(8, -1).toLowerCase();
const seg = (c, key, origin) => ({
  ...c,
  path: c.path + '[' + (typeof key === 'number' ? key : JSON.stringify(String(key))) + ']',
  origin, depth: c.depth + 1
});
const issue = (message, expected, value, c) => ({
  message, expected, received: typeOf(value), path: c.path, origin: c.origin
});
const fix = (r, value, c) => ({
  ...issue('Invalid value', 'unknown', value, c),
  ...(typeof r === 'string' ? { message: r } : r && typeof r === 'object' ? r : {})
});
const call = async (s, value, c) => {
  const r = await s(value, c);
  return Array.isArray(r) ? r : r == null || r === true ? [] : [fix(r, value, c)];
};

// Bounds the whole validation and honours an AbortSignal. In-flight user work
// is not cancelled — pass `context.signal` to your own fetch/db call for that.
const race = (promise, c) => {
  const signal = c?.signal;
  if (signal?.aborted) return Promise.reject(new Error('Validation aborted'));
  const deadline = c?.deadline || 0;
  if (!deadline && !signal) return Promise.resolve(promise);
  let timer, onAbort;
  const guards = [];
  if (deadline) guards.push(new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Validation timed out')), Math.max(0, deadline - Date.now()));
    if (timer.unref) timer.unref();
  }));
  if (signal) guards.push(new Promise((_, reject) => {
    onAbort = () => reject(new Error('Validation aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
  }));
  return Promise.race([Promise.resolve(promise), ...guards]).finally(() => {
    if (timer) clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
};
/** Wrap your own async work so it participates in timeout/abort. */
const withTimeout = (promise, ms, signal) =>
  race(Promise.resolve(promise), { deadline: ms ? Date.now() + ms : 0, signal });

const depth = (c, type, value) => c.depth > 64 ? [issue('Too deep', type, value, c)] : null;

// --- entry points ----------------------------------------------------------
const evaluateAsync = async (schema, value, options = {}) => {
  const c = root();
  c.signal = options.signal;
  c.deadline = options.timeout ? Date.now() + options.timeout : 0;
  try {
    const issues = await race(call(schema, value, c), c);
    return { issues, data: c.out.set ? c.out.value : value };
  } catch (error) {
    return { issues: [issue(`Threw: ${error?.message || error}`, 'validator', value, c)], data: value };
  }
};
const parseAsync = async (schema, value, options) => {
  const { issues, data } = await evaluateAsync(schema, value, options);
  if (issues.length) throw new VError(issues[0].message, issues);
  return data;
};
const safeParseAsync = async (schema, value, options) => {
  const { issues, data } = await evaluateAsync(schema, value, options);
  return issues.length
    ? { success: false, error: new VError(issues[0].message, issues) }
    : { success: true, data };
};
const isAsync = async (schema, value, options) =>
  (await evaluateAsync(schema, value, options)).issues.length === 0;

// --- async-aware combinators ----------------------------------------------
const customAsync = (validate, message = 'Invalid value', validations = []) =>
  async (value, c = root()) => {
    const tooDeep = depth(c, 'custom', value);
    if (tooDeep) return tooDeep;
    if (!(await validate(value, c))) return [issue(message, 'custom', value, c)];
    return (await Promise.all(validations.map(v => call(v, value, c)))).flat();
  };

const objectAsync = (shape, message = '', validations = [], exact = false) =>
  async (value, c = root()) => {
    const tooDeep = depth(c, 'object', value);
    if (tooDeep) return tooDeep;
    if (typeOf(value) !== 'object') {
      return [issue(message || `Expected object, got ${typeOf(value)}`, 'object', value, c)];
    }
    const keys = Reflect.ownKeys(shape);
    const extra = exact ? Reflect.ownKeys(value).filter(k => !keys.includes(k)) : [];
    // Promise.all preserves input order, so the first issue stays deterministic.
    const [fields, own] = await Promise.all([
      Promise.all(keys.map(k => call(shape[k], Object.hasOwn(value, k) ? value[k] : undefined, seg(c, k, 'value')))),
      Promise.all(validations.map(v => call(v, value, c)))
    ]);
    return [
      ...(extra.length ? [issue(`Extra keys: ${extra.map(String).join(', ')}`, 'object', value, { ...c, origin: 'key' })] : []),
      ...fields.flat(), ...own.flat()
    ];
  };
const strictAsync = (shape, message = '', validations = []) => objectAsync(shape, message, validations, true);

const arrayAsync = (schema, message = '', validations = []) =>
  async (value, c = root()) => {
    const tooDeep = depth(c, 'array', value);
    if (tooDeep) return tooDeep;
    if (!Array.isArray(value)) return [issue(message || `Expected array, got ${typeOf(value)}`, 'array', value, c)];
    return (await Promise.all([
      ...value.map((item, i) => call(schema, item, seg(c, i, 'value'))),
      ...validations.map(v => call(v, value, c))
    ])).flat();
  };

const tupleAsync = (schemas, message = '', validations = []) =>
  async (value, c = root()) => {
    if (!Array.isArray(value)) return [issue(message || `Expected tuple, got ${typeOf(value)}`, 'tuple', value, c)];
    if (value.length !== schemas.length) {
      return [issue(`Tuple length ${schemas.length} != ${value.length}`, 'tuple', value, c)];
    }
    return (await Promise.all([
      ...schemas.map((s, i) => call(s, value[i], seg(c, i, 'value'))),
      ...validations.map(v => call(v, value, c))
    ])).flat();
  };

// Sequential on purpose: short-circuit must not run later branches (they may
// hit a database). Total failure aggregates every branch's issues.
const orAsync = (...schemas) => async (value, c = root()) => {
  const errors = [];
  for (const s of schemas) {
    const issues = await call(s, value, c);
    if (!issues.length) return [];
    errors.push(...issues);
  }
  return schemas.length ? errors : [issue('No schemas', 'or', value, c)];
};
const andAsync = (...schemas) => async (value, c = root()) =>
  (await Promise.all(schemas.map(s => call(s, value, c)))).flat();
const optionalAsync = (schema, message = '', validations = []) =>
  async (value, c = root()) => value === undefined ? []
    : (await call(schema, value, c)).concat(
      (await Promise.all(validations.map(v => call(v, value, c)))).flat()
    ).map(i => message ? { ...i, message } : i);
const nullableAsync = (schema, message = '', validations = []) =>
  async (value, c = root()) => value === null ? []
    : (await call(schema, value, c)).concat(
      (await Promise.all(validations.map(v => call(v, value, c)))).flat()
    ).map(i => message ? { ...i, message } : i);

// --- check / transform actions ---------------------------------------------
const checkAsync = (fn, message = 'Invalid value') =>
  async (value, c) => (await fn(value, c)) ? true : message;
const rawCheckAsync = fn => async (value, c) => fn(value, c);
const tagged = fn => Object.assign(fn, { _transform: true });
const transformAsync = fn => tagged(async (value, c = root()) => race(Promise.resolve(fn(value, c)), c));

const pipeAsync = (schema, ...actions) => async (value, c = root()) => {
  let next = value;
  for (const a of actions) if (a && a._transform) next = await a(next, c);
  if (!c.path) { c.out.set = true; c.out.value = next; }
  const issues = await call(schema, next, c);
  const extra = [];
  for (const a of actions) if (!a || !a._transform) extra.push(...await call(a, next, c));
  return [...issues, ...extra];
};

const fallbackAsync = (schema, value) => async (input, c = root()) => {
  const issues = await call(schema, input, c);
  if (!issues.length) return [];
  const fb = typeof value === 'function' ? await value(input, c) : value;
  if (!c.path) { c.out.set = true; c.out.value = fb; }
  return call(schema, fb, c);
};
const messageAsync = (schema, text) => async (value, c = root()) =>
  (await call(schema, value, c)).map(i => ({ ...i, message: text }));

// --- deep-await helper (Option D: precompute, then validate synchronously) --
const walk = async (value, seen) => {
  const v = await value;
  if (!v || typeof v !== 'object' || seen.has(v)) return v;
  seen.add(v);
  if (Array.isArray(v)) return Promise.all(v.map(x => walk(x, seen)));
  if (typeOf(v) === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    const entries = await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await walk(x, seen)]));
    return Object.fromEntries(entries);
  }
  return v;
};
const resolveAsync = input => walk(input, new WeakSet());

export {
  parseAsync, safeParseAsync, isAsync, evaluateAsync,
  customAsync, objectAsync, strictAsync, arrayAsync, tupleAsync,
  orAsync, andAsync, optionalAsync, nullableAsync,
  checkAsync, rawCheckAsync, transformAsync, pipeAsync,
  fallbackAsync, messageAsync,
  resolveAsync, withTimeout
};
