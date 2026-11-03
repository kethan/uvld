// uvld — tiny, zero-dependency schema validation.
//
// A validator is `(value, context) => Result`, where Result is an array of
// Issue objects (empty === valid). Refinements may also return true/false,
// a message string, or a partial Issue; `call()` normalises all of them.
// Context carries the path, value origin, depth guard and (implicitly) the
// transformed output.

// `out` is a shared mutable box (not module-level state), so a root transform
// can publish its result without racing an await. Child contexts are new
// objects that point at the very same box. evaluate() makes one per call.
const ROOT = { path: '', origin: 'value', depth: 0, out: { set: false, value: undefined } };

// Precise, cross-realm type names: null, array, date, map, set, promise, ...
const typeOf = v => v === null ? 'null'
  : typeof v !== 'object' ? typeof v
    : Object.prototype.toString.call(v).slice(8, -1).toLowerCase();

// JSON.stringify is only needed for keys with characters that must be escaped;
// plain keys take the fast path (stringifying every key on every validation
// showed up as the object hot path).
const quoted = k => /["\\\u0000-\u001f\ud800-\udfff]/.test(k) ? JSON.stringify(k) : '"' + k + '"';

// Bracket-quoted segments: a key containing dots can never look like a path.
const seg = (c, key, origin) => ({
  path: c.path + '[' + (typeof key === 'number' ? key : quoted(String(key))) + ']',
  origin,
  depth: c.depth + 1,
  out: c.out
});

// Concat in place: avoids the callback closure and one array per element that
// flatMap() allocates. `from` is always one validator's issues, never the
// growing accumulator, so the spread stays small.
const push = (into, from) => into.push(...from);

const issue = (message, expected, value, c) => ({
  message,
  expected,
  received: typeOf(value), // type tag only — raw values never enter errors
  path: c.path,
  origin: c.origin
});

const fix = (r, value, c) => ({
  ...issue('Invalid value', 'unknown', value, c),
  ...(typeof r === 'string' ? { message: r } : r && typeof r === 'object' ? r : {})
});

// Normalise anything a validator/refinement returns into Issue[]. Internal
// validators always return Issue[]; refinements may return true/false/string/
// partial issue.
const call = (s, value, c) => {
  const r = s(value, c);
  return Array.isArray(r) ? r : r == null || r === true ? [] : [fix(r, value, c)];
};

// Uniform signature for the whole API:
//   factory(message?: string, validations?: Validator[]): Validator
const define = (type, validate) => (message = '', validations = []) => {
  const fn = (value, c = ROOT) => {
    if (c.depth > 64) return [issue('Too deep', type, value, c)];
    if (!validate(value, c)) return [issue(message || `Expected ${type}, got ${typeOf(value)}`, type, value, c)];
    // Most validators carry zero or one refinement; looping skips the closure
    // and the arrays flatMap() would allocate on every single validation.
    const n = validations.length;
    if (n < 2) return n ? call(validations[0], value, c) : [];
    const issues = [];
    for (let i = 0; i < n; i++) issues.push(...call(validations[i], value, c));
    return issues;
  };
  // What this validator checks, for the experimental compiler in compile.js.
  // Costs one small array per schema at build time.
  fn.meta = [type, validate, validations];
  return fn;
};

// --- primitives -----------------------------------------------------------
// Each primitive is a plain function that calls `define()` when a consumer
// asks for a validator, never at module load. An unused export is therefore
// just an unreferenced arrow function, which every bundler drops; a module-level
// `define(...)` call looks side-effectful and would be kept.
const string = (message, validations) => define('string', v => typeof v === 'string')(message, validations);
const boolean = (message, validations) => define('boolean', v => typeof v === 'boolean')(message, validations);
const number = (message, validations) => define('number', v => typeof v === 'number' && Number.isFinite(v))(message, validations);
const func = (message, validations) => define('function', v => typeof v === 'function')(message, validations);
const symbol = (message, validations) => define('symbol', v => typeof v === 'symbol')(message, validations);
const bigint = (message, validations) => define('bigint', v => typeof v === 'bigint')(message, validations);
const integer = (message, validations) => define('integer', Number.isInteger)(message, validations);
const date = (message, validations) => define('date', v => v instanceof Date && !Number.isNaN(v.getTime()))(message, validations);
const promise = (message, validations) => define('promise', v => v != null && typeof v.then === 'function')(message, validations);
const never = (message, validations) => define('never', () => false)(message, validations);
const any = (message, validations) => define('any', () => true)(message, validations);
const unknown = (message, validations) => define('unknown', () => true)(message, validations);
const nullish = (message, validations) => define('nullish', v => v == null)(message, validations);

// --- literals, classes, enums ---------------------------------------------
const literal = (v, message = '', validations = []) =>
  define('literal', x => Object.is(x, v))(message || `Expected ${String(v)}`, validations);

const instance = (ref, message = '', validations = []) => {
  if (typeof ref !== 'function' || !ref.prototype) throw new TypeError('Bad class');
  return define('instance', v => v instanceof ref)(message, validations);
};

const enums = (values, message = '', validations = []) => {
  if (!Array.isArray(values)) throw new TypeError('Bad enum');
  return define('enums', v => values.includes(v))(message, validations);
};

// --- wrappers --------------------------------------------------------------
// Nested issues are preserved; only an explicit message overrides them.
const wrap = (schema, message, validations, skip) => (value, c = ROOT) => {
  if (skip(value)) return [];
  let issues = call(schema, value, c);
  if (validations.length) {
    issues = [...issues];
    for (let i = 0; i < validations.length; i++) push(issues, call(validations[i], value, c));
  }
  return message ? issues.map(i => ({ ...i, message })) : issues;
};
const optional = (schema, message = '', validations = []) => wrap(schema, message, validations, v => v === undefined);
const nullable = (schema, message = '', validations = []) => wrap(schema, message, validations, v => v === null);

const custom = (validate, message = 'Invalid value', validations = []) =>
  define('custom', (v, c) => validate(v, c))(message, validations);

// --- composites ------------------------------------------------------------
const items = (schema, value, c) => {
  const issues = [];
  let i = 0;
  for (const item of value) push(issues, call(schema, item, seg(c, i++, 'value')));
  return issues;
};

// Shared by record (own keys, incl. symbols) and map (entries).
const pairs = (keySchema, valueSchema, value, c, isMap) => {
  const issues = [];
  let i = 0;
  for (const k of isMap ? value : Reflect.ownKeys(value)) {
    const at = isMap ? i++ : k;
    push(issues, call(keySchema, isMap ? k[0] : k, seg(c, at, 'key')));
    push(issues, call(valueSchema, isMap ? k[1] : value[k], seg(c, at, 'value')));
  }
  return issues;
};

const array = (schema, message = '', validations = []) => {
  const fn = define('array', Array.isArray)(message, [(value, c) => items(schema, value, c), ...validations]);
  fn.item = schema;
  return fn;
};
const set = (schema, message = '', validations = []) =>
  define('set', v => typeOf(v) === 'set')(message, [(value, c) => items(schema, value, c), ...validations]);
const record = (keySchema, valueSchema, message = '', validations = []) =>
  define('record', v => typeOf(v) === 'object')(message, [(value, c) => pairs(keySchema, valueSchema, value, c, false), ...validations]);
const map = (keySchema, valueSchema, message = '', validations = []) =>
  define('map', v => typeOf(v) === 'map')(message, [(value, c) => pairs(keySchema, valueSchema, value, c, true), ...validations]);

// Plain objects only; own properties only (the prototype chain cannot satisfy
// a key); symbol keys are supported; extra keys reported together with field
// errors instead of short-circuiting.
// Keys and their path suffixes are computed once, the first time the schema is
// used: running Reflect.ownKeys() and stringifying every key on *every*
// validation was the largest single cost in object validation, but doing it in
// the factory made schema creation measurably slower.
const object = (schema, message = '', validations = [], exact = false) => {
  let keys, fns, suffixes;
  const prep = () => {
    if (!keys) {
      keys = Reflect.ownKeys(schema);
      suffixes = keys.map(k => '[' + quoted(String(k)) + ']');
      fns = keys.map(k => schema[k]);
    }
  };
  const fn = define('object', v => typeOf(v) === 'object')(message, [
    (value, c) => {
      prep();
      const issues = [];
      if (exact) {
        const extra = Reflect.ownKeys(value).filter(k => !keys.includes(k));
        if (extra.length) issues.push(issue(`Extra keys: ${extra.map(String).join(', ')}`, 'object', value, { ...c, origin: 'key' }));
      }
      for (let i = 0; i < keys.length; i++) {
        push(issues, call(fns[i], Object.hasOwn(value, keys[i]) ? value[keys[i]] : undefined, {
          path: c.path + suffixes[i], origin: 'value', depth: c.depth + 1, out: c.out
        }));
      }
      return issues;
    },
    ...validations
  ]);
  fn.shape = () => (prep(), [keys, fns]);
  fn.exact = exact;
  return fn;
};
const strict = (schema, message = '', validations = []) => object(schema, message, validations, true);

const tuple = (schemas, message = '', validations = []) =>
  define('tuple', Array.isArray)(message, [
    (value, c) => {
      if (value.length !== schemas.length) return [issue(`Tuple length ${schemas.length} != ${value.length}`, 'tuple', value, c)];
      const issues = [];
      for (let i = 0; i < schemas.length; i++) push(issues, call(schemas[i], value[i], seg(c, i, 'value')));
      return issues;
    },
    ...validations
  ]);

// --- constraints -----------------------------------------------------------
const size = v => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' || Array.isArray(v)) return v.length;
  const t = typeOf(v);
  return t === 'map' || t === 'set' ? v.size : NaN; // unsupported -> NaN -> clean issue
};
const min = (bound, message = '', validations = []) =>
  define('min', v => size(v) >= bound)(message || `Min ${bound}`, validations);
const max = (bound, message = '', validations = []) =>
  define('max', v => size(v) <= bound)(message || `Max ${bound}`, validations);

// --- combinators -----------------------------------------------------------
// Each branch is tested on its own result (never by counting issues), with
// short-circuiting; all branch issues are aggregated on total failure.
const or = (...schemas) => (value, c = ROOT) => {
  const errors = [];
  for (const s of schemas) {
    const issues = call(s, value, c);
    if (!issues.length) return [];
    errors.push(...issues);
  }
  return schemas.length ? errors : [issue('No schemas', 'or', value, c)];
};
const and = (...schemas) => (value, c = ROOT) => {
  const issues = [];
  for (let i = 0; i < schemas.length; i++) push(issues, call(schemas[i], value, c));
  return issues;
};

const not = (schema, message = '', validations = []) =>
  define('not', (v, c) => call(schema, v, c).length > 0)(message, validations);

const lazy = resolve => {
  let schema;
  return (value, c = ROOT) => (schema ||= resolve())(value, c); // resolved once
};

// At the root of parse/safeParse the transformed value is the returned data.
// Nested transforms affect validation only (documented in the README).
const transform = (schema, fn) => (value, c = ROOT) => {
  const next = fn(value);
  if (!c.path) { c.out.set = true; c.out.value = next; }
  return call(schema, next, c);
};

// --- entry points ----------------------------------------------------------
class VError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'VError';
    this.issues = issues;
  }
}

// Single evaluation path for is/parse/safeParse. Unexpected throws from user
// validators become an issue, so `safeParse` is genuinely safe.
const evaluate = (schema, value) => {
  const ctx = { path: '', origin: 'value', depth: 0, out: { set: false, value: undefined } };
  try {
    const issues = call(schema, value, ctx);
    return { issues, data: ctx.out.set ? ctx.out.value : value };
  } catch (error) {
    return { issues: [issue(`Threw: ${error?.message || error}`, 'validator', value, ctx)], data: value };
  }
};

const is = (schema, value) => evaluate(schema, value).issues.length === 0;
const parse = (schema, value) => {
  const { issues, data } = evaluate(schema, value);
  if (issues.length) throw new VError(issues[0].message, issues);
  return data;
};
const safeParse = (schema, value) => {
  const { issues, data } = evaluate(schema, value);
  return issues.length
    ? { success: false, error: new VError(issues[0].message, issues) }
    : { success: true, data };
};

export {
  define,
  string, boolean, number, func, symbol, bigint, integer, date, promise,
  never, any, unknown, nullish,
  literal, instance, enums,
  optional, nullable, custom,
  record, map, array, set, object, strict, tuple,
  min, max,
  or, and, not, lazy, transform,
  is, parse, safeParse, VError
};

// Optional utilities ship from this same entry point — one import surface,
// `import { email, string } from 'uvld'`. The module boundaries stay in the
// source; Rollup emits a single file. Every utility is a lazy factory (see
// `utils.js`), so a consumer that never touches them pays no bytes.
export * from './utils.js';
