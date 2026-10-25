// uvld — tiny, zero-dependency schema validation.
//
// A validator is `(value, context) => Result`, where Result is an array of
// Issue objects (empty === valid). Refinements may also return true/false,
// a message string, or a partial Issue; `call()` normalises all of them.
// Context carries the path, value origin, depth guard and (implicitly) the
// transformed output.

const ROOT = { path: '', origin: 'value', depth: 0 };
let out; // root transform result, saved/restored by evaluate()

// Precise, cross-realm type names: null, array, date, map, set, promise, ...
const typeOf = v => v === null ? 'null'
  : typeof v !== 'object' ? typeof v
    : Object.prototype.toString.call(v).slice(8, -1).toLowerCase();

// Bracket-quoted segments: a key containing dots can never look like a path.
const seg = (c, key, origin) => ({
  ...c,
  path: c.path + '[' + (typeof key === 'number' ? key : JSON.stringify(String(key))) + ']',
  origin,
  depth: c.depth + 1
});

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
const define = (type, validate) => (message = '', validations = []) => (value, c = ROOT) => {
  if (c.depth > 64) return [issue('Too deep', type, value, c)];
  if (!validate(value, c)) return [issue(message || `Expected ${type}, got ${typeOf(value)}`, type, value, c)];
  return validations.flatMap(v => call(v, value, c));
};

// --- primitives -----------------------------------------------------------
const string = define('string', v => typeof v === 'string');
const boolean = define('boolean', v => typeof v === 'boolean');
const number = define('number', v => typeof v === 'number' && Number.isFinite(v));
const func = define('function', v => typeof v === 'function');
const symbol = define('symbol', v => typeof v === 'symbol');
const bigint = define('bigint', v => typeof v === 'bigint');
const integer = define('integer', Number.isInteger);
const date = define('date', v => v instanceof Date && !Number.isNaN(v.getTime()));
const promise = define('promise', v => v != null && typeof v.then === 'function');
const never = define('never', () => false);
const any = define('any', () => true);
const unknown = define('unknown', () => true);
const nullish = define('nullish', v => v == null);

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
  const issues = [call(schema, value, c), ...validations.map(v => call(v, value, c))].flat();
  return message ? issues.map(i => ({ ...i, message })) : issues;
};
const optional = (schema, message = '', validations = []) => wrap(schema, message, validations, v => v === undefined);
const nullable = (schema, message = '', validations = []) => wrap(schema, message, validations, v => v === null);

const custom = (validate, message = 'Invalid value', validations = []) =>
  define('custom', (v, c) => validate(v, c))(message, validations);

// --- composites ------------------------------------------------------------
const items = (schema, value, c) =>
  [...value].flatMap((item, i) => call(schema, item, seg(c, i, 'value')));

// Shared by record (own keys, incl. symbols) and map (entries).
const pairs = (keySchema, valueSchema, value, c, isMap) =>
  (isMap ? [...value] : Reflect.ownKeys(value).map(k => [k, value[k]]))
    .flatMap(([k, v], i) => {
      const at = isMap ? i : k;
      return [
        ...call(keySchema, k, seg(c, at, 'key')),
        ...call(valueSchema, v, seg(c, at, 'value'))
      ];
    });

const array = (schema, message = '', validations = []) =>
  define('array', Array.isArray)(message, [(value, c) => items(schema, value, c), ...validations]);
const set = (schema, message = '', validations = []) =>
  define('set', v => typeOf(v) === 'set')(message, [(value, c) => items(schema, value, c), ...validations]);
const record = (keySchema, valueSchema, message = '', validations = []) =>
  define('record', v => typeOf(v) === 'object')(message, [(value, c) => pairs(keySchema, valueSchema, value, c, false), ...validations]);
const map = (keySchema, valueSchema, message = '', validations = []) =>
  define('map', v => typeOf(v) === 'map')(message, [(value, c) => pairs(keySchema, valueSchema, value, c, true), ...validations]);

// Plain objects only; own properties only (the prototype chain cannot satisfy
// a key); symbol keys are supported; extra keys reported together with field
// errors instead of short-circuiting.
const object = (schema, message = '', validations = [], exact = false) =>
  define('object', v => typeOf(v) === 'object')(message, [
    (value, c) => {
      const keys = Reflect.ownKeys(schema);
      const extra = exact ? Reflect.ownKeys(value).filter(k => !keys.includes(k)) : [];
      return [
        ...(extra.length
          ? [issue(`Extra keys: ${extra.map(String).join(', ')}`, 'object', value, { ...c, origin: 'key' })]
          : []),
        ...keys.flatMap(k => call(schema[k], Object.hasOwn(value, k) ? value[k] : undefined, seg(c, k, 'value')))
      ];
    },
    ...validations
  ]);
const strict = (schema, message = '', validations = []) => object(schema, message, validations, true);

const tuple = (schemas, message = '', validations = []) =>
  define('tuple', Array.isArray)(message, [
    (value, c) => value.length !== schemas.length
      ? [issue(`Tuple length ${schemas.length} != ${value.length}`, 'tuple', value, c)]
      : schemas.flatMap((s, i) => call(s, value[i], seg(c, i, 'value'))),
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
const and = (...schemas) => (value, c = ROOT) => schemas.flatMap(s => call(s, value, c));

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
  if (!c.path) out = { v: next };
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
  const previous = out;
  out = undefined;
  try {
    const issues = call(schema, value, ROOT);
    return { issues, data: out ? out.v : value };
  } catch (error) {
    return { issues: [issue(`Threw: ${error?.message || error}`, 'validator', value, ROOT)], data: value };
  } finally {
    out = previous;
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
