// uvld/utils — optional, tree-shakeable add-on utilities.
// This module is a SEPARATE entry point: importing it never adds a byte to the
// core `uvld` bundle. Everything here is either
//   * a CHECK   (value) => true | message | partial Issue | Issue[]
//   * a TRANSFORM ACTION (value) => value, tagged with `_transform`
// Checks can be used standalone or in a core `validations` array; transform
// actions are used with `pipe(...)` / core `transform(schema, action)`.
import {
  transform as coreTransform, is as coreIs, safeParse, object as coreObject,
  tuple as coreTuple, and as coreAnd
} from './index.js';

// --- small helpers ---------------------------------------------------------
const yes = true;
const rx = (re, v) => typeof v === 'string' && re.test(v);
const luhn = s => {
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = +s[i];
    if (alt && (n *= 2) > 9) n -= 9;
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};
const isbnCheck = v => {
  const s = String(v).replace(/-/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i] === 'X' ? 10 : +s[i]);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += (i % 2 ? 3 : 1) * +s[i];
    return sum % 10 === 0;
  }
  return false;
};
const sizeOf = v =>
  v instanceof Map || v instanceof Set ? v.size
    : typeof v === 'string' || Array.isArray(v) ? v.length
      : v && typeof v === 'object' ? Object.keys(v).length : NaN;

/** A check factory: `fn` returns a boolean, message, partial issue or Issue[]. */
const fmt = (name, test) => (message = `Invalid ${name}`) => v => test(v) ? yes : message;

/** Exact/min/max/not constraint over a measured quantity. */
const M = {
  length: v => typeof v === 'string' || Array.isArray(v) ? v.length : NaN,
  bytes: v => typeof v === 'string' ? new TextEncoder().encode(v).length : NaN,
  codePoints: v => typeof v === 'string' ? [...v].length : NaN,
  graphemes: v => typeof v === 'string'
    ? (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(v)].length : [...v].length)
    : NaN,
  words: v => typeof v === 'string' ? (v.match(/\S+/gu) || []).length : NaN,
  size: sizeOf,
  entries: v => v instanceof Map ? v.size : v && typeof v === 'object' ? Object.keys(v).length : NaN,
  value: v => typeof v === 'number' || typeof v === 'bigint' ? Number(v)
    : v instanceof Date ? v.getTime() : NaN
};
const limit = (kind, op, label) => (bound, message = `${label} ${bound}`) => v => {
  const n = M[kind](v);
  return Number.isFinite(n) && op(n, bound) ? yes : message;
};
const gt = (a, b) => a > b, lt = (a, b) => a < b;
const ge = (a, b) => a >= b, le = (a, b) => a <= b;
const eq = (a, b) => a === b, ne = (a, b) => a !== b;

/** Tag a function as a transform action for `pipe`. */
const tx = fn => Object.assign(fn, { _transform: true });
const splitWords = s => String(s)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .split(/[^A-Za-z0-9]+/).filter(Boolean);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Normalise a check result into Issue[] (used by `pipe`). */
const issuesOf = (r, value, c) => {
  if (r == null || r === true) return [];
  if (Array.isArray(r)) return r;
  const base = {
    message: 'Invalid value', expected: 'unknown', received: typeof value,
    path: c?.path || '', origin: c?.origin || 'value'
  };
  return [typeof r === 'string' ? { ...base, message: r }
    : r && typeof r === 'object' ? { ...base, ...r } : base];
};

// --- format checks ---------------------------------------------------------
const R = {
  base64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  bic: /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/i,
  cuid2: /^[a-z][a-z0-9]{23}$/,
  decimal: /^[+-]?\d+(?:\.\d+)?$/,
  digits: /^\d+$/,
  domain: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  rfcEmail: /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/,
  emoji: /^\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*$/u,
  hexadecimal: /^[0-9a-f]+$/i,
  hexColor: /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  imei: /^\d{15}$/,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
  isbn: /^(?:\d[\d-]{8,16}[\dXx])$/,
  isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/,
  isoDate: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/,
  isoDateTime: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d$/,
  isoDateTimeSecond: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
  isoTime: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  isoTimeSecond: /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
  isoTimestamp: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/,
  isoWeek: /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/,
  jwsCompact: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  ksuid: /^[0-9A-Za-z]{27}$/,
  mac48: /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i,
  mac64: /^(?:[0-9a-f]{2}[:-]){7}[0-9a-f]{2}$/i,
  mimeType: /^[a-z]+\/[a-z0-9][a-z0-9.+*-]*(?:\s*;\s*.+)?$/i,
  octal: /^[0-7]+$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
};

const isIPv6 = v => {
  if (typeof v !== 'string' || !v.includes(':')) return false;
  try { new globalThis.URL(`http://[${v}]/`); return true; } catch { return false; }
};
const validUrl = v => {
  if (typeof v !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
  try { new globalThis.URL(v); return true; } catch { return false; }
};

const base64 = fmt('base64', v => rx(R.base64, v));
const bic = fmt('bic', v => rx(R.bic, v));
const cuid2 = fmt('cuid2', v => rx(R.cuid2, v));
const decimal = fmt('decimal', v => rx(R.decimal, v));
const digits = fmt('digits', v => rx(R.digits, v));
const domain = fmt('domain', v => rx(R.domain, v));
const email = fmt('email', v => rx(R.email, v));
const rfcEmail = fmt('RFC email', v => rx(R.rfcEmail, v) && v.length <= 254 && !v.includes('..'));
const emoji = fmt('emoji', v => rx(R.emoji, v));
const hexadecimal = fmt('hexadecimal', v => rx(R.hexadecimal, v));
const hexColor = fmt('hex color', v => rx(R.hexColor, v));
const imei = fmt('IMEI', v => typeof v === 'string' && rx(R.imei, v) && luhn(v));
const ipv4 = fmt('IPv4', v => rx(R.ipv4, v));
const ipv6 = fmt('IPv6', isIPv6);
const ip = fmt('IP', v => rx(R.ipv4, v) || isIPv6(v));
const isrc = fmt('ISRC', v => rx(R.isrc, v));
const isoDate = fmt('ISO date', v => rx(R.isoDate, v));
const isoDateTime = fmt('ISO date-time', v => rx(R.isoDateTime, v));
const isoDateTimeSecond = fmt('ISO date-time', v => rx(R.isoDateTimeSecond, v));
const isoTime = fmt('ISO time', v => rx(R.isoTime, v));
const isoTimeSecond = fmt('ISO time', v => rx(R.isoTimeSecond, v));
const isoTimestamp = fmt('ISO timestamp', v => rx(R.isoTimestamp, v));
const isoWeek = fmt('ISO week', v => rx(R.isoWeek, v));
const jwsCompact = fmt('JWS compact', v => rx(R.jwsCompact, v));
const ksuid = fmt('KSUID', v => rx(R.ksuid, v));
const mac48 = fmt('MAC-48', v => rx(R.mac48, v));
const mac64 = fmt('MAC-64', v => rx(R.mac64, v));
const mac = fmt('MAC', v => rx(R.mac48, v) || rx(R.mac64, v));
const mimeType = fmt('MIME type', v => rx(R.mimeType, v));
const octal = fmt('octal', v => rx(R.octal, v));
const slug = fmt('slug', v => rx(R.slug, v));
const ulid = fmt('ULID', v => rx(R.ulid, v));
const url = fmt('URL', validUrl);
const uuid = fmt('UUID', v => rx(R.uuid, v));
const isbn = fmt('ISBN', v => typeof v === 'string' && rx(R.isbn, v) && isbnCheck(v));
const creditCard = fmt('credit card', v => {
  if (typeof v !== 'string') return false;
  const s = v.replace(/[\s-]/g, '');
  return /^\d{13,19}$/.test(s) && luhn(s);
});
const nanoid = (size = 21, message = `Invalid nanoid`) =>
  fmt('nanoid', v => new RegExp(`^[A-Za-z0-9_-]{${size}}$`).test(v))(message);
const hash = (algorithm = 'sha256', message = `Invalid ${algorithm} hash`) => {
  const len = { md5: 32, sha1: 40, sha256: 64, sha384: 96, sha512: 128 }[String(algorithm).toLowerCase()];
  return fmt('hash', v => typeof v === 'string' && !!len && new RegExp(`^[0-9a-f]{${len}}$`, 'i').test(v))(message);
};

// --- generic checks --------------------------------------------------------
const check = (fn, message = 'Invalid value') => v => fn(v) ? yes : message;
const rawCheck = fn => (value, context) => fn(value, context);
const guard = schema => value => coreIs(schema, value);
const regex = (re, message = 'Invalid format') => v => (typeof v === 'string' && re.test(v)) ? yes : message;
const partialCheck = (shape, fn, message = 'Invalid value') => value => {
  const keys = Object.keys(shape).filter(k => value != null && k in Object(value));
  const subset = Object.fromEntries(keys.map(k => [k, shape[k]]));
  return safeParse(coreObject(subset), value).success && fn(value) ? yes : message;
};
const values = (list, message = 'Value not allowed') => v => list.some(x => Object.is(x, v)) ? yes : message;
const value = (expected, message = `Expected ${String(expected)}`) => v => Object.is(v, expected) ? yes : message;
const notValue = (expected, message = `Unexpected ${String(expected)}`) => v => Object.is(v, expected) ? message : yes;
const notValues = (list, message = 'Forbidden value') => v => list.some(x => Object.is(x, v)) ? message : yes;
const multipleOf = (divisor, message = `Not a multiple of ${divisor}`) => v =>
  typeof v === 'number' && Number.isFinite(v) && v % divisor === 0 ? yes : message;
const finite = fmt('finite number', v => typeof v === 'number' && Number.isFinite(v));
const integer = fmt('integer', Number.isInteger);
const safeInteger = fmt('safe integer', Number.isSafeInteger);
const empty = fmt('empty', v => { const n = sizeOf(v); return Number.isFinite(n) && n === 0; });
const nonEmpty = fmt('non-empty', v => { const n = sizeOf(v); return Number.isFinite(n) && n > 0; });
const includes = (needle, message = `Must include ${String(needle)}`) => v =>
  (typeof v === 'string' || Array.isArray(v)) && v.includes(needle) ? yes : message;
const excludes = (needle, message = `Must not include ${String(needle)}`) => v =>
  (typeof v === 'string' || Array.isArray(v)) && !v.includes(needle) ? yes : message;
const startsWith = (prefix, message = `Must start with ${String(prefix)}`) => v =>
  typeof v === 'string' && v.startsWith(prefix) ? yes : message;
const endsWith = (suffix, message = `Must end with ${String(suffix)}`) => v =>
  typeof v === 'string' && v.endsWith(suffix) ? yes : message;

// --- length / size / count / value constraints ------------------------------
const length = limit('length', eq, 'Length');
const minLength = limit('length', ge, 'Min length');
const maxLength = limit('length', le, 'Max length');
const notLength = limit('length', ne, 'Not length');
const bytes = limit('bytes', eq, 'Bytes');
const minBytes = limit('bytes', ge, 'Min bytes');
const maxBytes = limit('bytes', le, 'Max bytes');
const notBytes = limit('bytes', ne, 'Not bytes');
const codePoints = limit('codePoints', eq, 'Code points');
const minCodePoints = limit('codePoints', ge, 'Min code points');
const maxCodePoints = limit('codePoints', le, 'Max code points');
const notCodePoints = limit('codePoints', ne, 'Not code points');
const graphemes = limit('graphemes', eq, 'Graphemes');
const minGraphemes = limit('graphemes', ge, 'Min graphemes');
const maxGraphemes = limit('graphemes', le, 'Max graphemes');
const notGraphemes = limit('graphemes', ne, 'Not graphemes');
const words = limit('words', eq, 'Words');
const minWords = limit('words', ge, 'Min words');
const maxWords = limit('words', le, 'Max words');
const notWords = limit('words', ne, 'Not words');
const size = limit('size', eq, 'Size');
const minSize = limit('size', ge, 'Min size');
const maxSize = limit('size', le, 'Max size');
const notSize = limit('size', ne, 'Not size');
const entries = limit('entries', eq, 'Entries');
const minEntries = limit('entries', ge, 'Min entries');
const maxEntries = limit('entries', le, 'Max entries');
const notEntries = limit('entries', ne, 'Not entries');
const minValue = limit('value', ge, 'Min value');
const maxValue = limit('value', le, 'Max value');
const gtValue = limit('value', gt, 'Greater than');
const ltValue = limit('value', lt, 'Less than');

// --- item collections ------------------------------------------------------
const everyItem = (fn, message = 'Invalid item') => v =>
  Array.isArray(v) && v.every(fn) ? yes : message;
const someItem = (fn, message = 'No matching item') => v =>
  Array.isArray(v) && v.some(fn) ? yes : message;
const checkItems = (schema, message = 'Invalid items') => v =>
  Array.isArray(v) && v.every(item => coreIs(schema, item)) ? yes : message;
const findItem = fn => tx(v => Array.isArray(v) ? v.find(fn) : v);
const mapItems = fn => tx(v => Array.isArray(v) ? v.map(fn) : v);
const filterItems = fn => tx(v => Array.isArray(v) ? v.filter(fn) : v);
const sortItems = cmp => tx(v => Array.isArray(v) ? [...v].sort(cmp) : v);
const reduceItems = (fn, initial) => tx(v => Array.isArray(v) ? v.reduce(fn, initial) : v);

// --- transform actions -----------------------------------------------------
const trim = () => tx(v => String(v).trim());
const trimStart = () => tx(v => String(v).trimStart());
const trimEnd = () => tx(v => String(v).trimEnd());
const toLowerCase = () => tx(v => String(v).toLowerCase());
const toUpperCase = () => tx(v => String(v).toUpperCase());
const toCamelCase = () => tx(v => splitWords(v).map((w, i) => i ? cap(w) : w.toLowerCase()).join(''));
const toPascalCase = () => tx(v => splitWords(v).map(cap).join(''));
const toKebabCase = () => tx(v => splitWords(v).map(w => w.toLowerCase()).join('-'));
const toSnakeCase = () => tx(v => splitWords(v).map(w => w.toLowerCase()).join('_'));
const normalize = (form = 'NFC') => tx(v => String(v).normalize(form));
const toNumber = () => tx(v => Number(v));
const toBoolean = () => tx(v => Boolean(v));
const parseBoolean = () => tx(v => {
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return Boolean(v);
});
const toBigint = () => tx(v => BigInt(v));
const toDate = () => tx(v => v instanceof Date ? v : new Date(v));
const toString = () => tx(v => String(v));
const toMinValue = min => tx(v => Math.max(v, min));
const toMaxValue = max => tx(v => Math.min(v, max));
const parseJson = reviver => tx(v => typeof v === 'string' ? JSON.parse(v, reviver) : v);
const stringifyJson = (replacer, space) => tx(v => JSON.stringify(v, replacer, space));
const rawTransform = fn => tx(fn);
const transform = coreTransform;

// --- composition / metadata ------------------------------------------------
const pipe = (schema, ...actions) => (value, c) => {
  let next = value;
  for (const a of actions) if (a && a._transform) next = a(next);
  const inner = coreTransform(schema, () => next);
  const issues = [...inner(value, c)];
  for (const a of actions) {
    if (a && a._meta) schema[a._meta] = a._value;
    else if (!a || !a._transform) issues.push(...issuesOf(a(next), next, c));
  }
  return issues;
};
const meta = key => (a, b) => {
  if (typeof a === 'function') { a[key] = b; return a; }
  return Object.assign(() => yes, { _meta: key, _value: a });
};
const title = meta('title');
const description = meta('description');
const metadata = meta('metadata');
const examples = meta('examples');
const brand = meta('brand');
const flavor = meta('flavor');
const readonly = schema => Object.assign(schema, { readonly: true });
const args = (...schemas) => coreTuple(schemas);
const returns = schema => fn => function (...params) {
  const result = fn.apply(this, params);
  const parsed = safeParse(schema, result);
  if (!parsed.success) throw parsed.error;
  return result;
};


// --- production gaps: formats, defaults, error helpers ---------------------
// Extra formats that are cheap and commonly needed at API/DB boundaries.
const alpha = fmt('letters', v => typeof v === 'string' && /^[A-Za-z]+$/.test(v));
const alphaNumeric = fmt('letters and digits', v => typeof v === 'string' && /^[A-Za-z0-9]+$/.test(v));
const lowercase = fmt('lowercase', v => typeof v === 'string' && v === v.toLowerCase());
const uppercase = fmt('uppercase', v => typeof v === 'string' && v === v.toUpperCase());
const ascii = fmt('ASCII', v => typeof v === 'string' && /^[\x00-\x7F]*$/.test(v));
const semver = fmt('semver', v => typeof v === 'string' &&
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(v));
const json = fmt('JSON', v => {
  if (typeof v !== 'string') return false;
  try { JSON.parse(v); return true; } catch { return false; }
});

// Numeric / date shorthand constraints.
const positive = fmt('positive number', v => typeof v === 'number' && Number.isFinite(v) && v > 0);
const negative = fmt('negative number', v => typeof v === 'number' && Number.isFinite(v) && v < 0);
const nonNegative = fmt('non-negative number', v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
const nonPositive = fmt('non-positive number', v => typeof v === 'number' && Number.isFinite(v) && v <= 0);
const inRange = (min, max, message = `Must be between ${min} and ${max}`) => v =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? yes : message;
const dateValue = v => v instanceof Date ? v.getTime()
  : typeof v === 'string' ? Date.parse(v)
    : typeof v === 'number' ? v : NaN;
const minDate = (bound, message = `Min date ${String(bound)}`) => v => {
  const t = dateValue(v), b = dateValue(bound);
  return Number.isFinite(t) && Number.isFinite(b) && t >= b ? yes : message;
};
const maxDate = (bound, message = `Max date ${String(bound)}`) => v => {
  const t = dateValue(v), b = dateValue(bound);
  return Number.isFinite(t) && Number.isFinite(b) && t <= b ? yes : message;
};

// Collection checks / transforms.
const uniqueItems = fmt('unique items', v => Array.isArray(v) && new Set(v).size === v.length);
const toUnique = () => tx(v => Array.isArray(v) ? [...new Set(v)] : v);
const compactItems = () => tx(v => Array.isArray(v) ? v.filter(x => x != null) : v);
const reverseItems = () => tx(v => Array.isArray(v) ? [...v].reverse() : v);

// Extra string transforms.
const toTitleCase = () => tx(v => splitWords(v).map(cap).join(' '));
const truncate = (max, suffix = '…') => tx(v => {
  const str = String(v);
  return str.length > max ? str.slice(0, Math.max(0, max - suffix.length)) + suffix : str;
});
const padStart = (length, fill = ' ') => tx(v => String(v).padStart(length, fill));
const padEnd = (length, fill = ' ') => tx(v => String(v).padEnd(length, fill));
const replace = (search, replacement) => tx(v => String(v).replace(search, replacement));

// Schema helpers: defaults, message overrides, nullish rejection, error output.
const fallback = (schema, value) => (input, c) =>
  safeParse(schema, input).success ? [] : coreTransform(schema, () => value)(input, c);
const message = (schema, text) => (value, c) => {
  const result = safeParse(schema, value);
  if (result.success) return [];
  return result.error.issues.map(i => ({
    ...i, message: text, path: (c?.path || '') + i.path, origin: c?.origin || 'value'
  }));
};
const nonNullable = (schema, message = 'Must not be null') =>
  coreAnd(v => v === null ? message : yes, schema);
const nonOptional = (schema, message = 'Must be defined') =>
  coreAnd(v => v === undefined ? message : yes, schema);
const nonNullish = (schema, message = 'Must not be null or undefined') =>
  coreAnd(v => v == null ? message : yes, schema);
/** Turn an Issue[] or VError into a `{ path: messages[] }` map for forms/APIs. */
const flatten = source => {
  const issues = Array.isArray(source) ? source : source?.issues || [];
  const flat = Object.create(null);
  for (const i of issues) (flat[i.path || ''] ||= []).push(i.message);
  return flat;
};

export {
  args, base64, bic, brand, bytes, check, checkItems, codePoints, creditCard,
  cuid2, decimal, description, digits, domain, email, emoji, empty, endsWith,
  entries, everyItem, examples, excludes, filterItems, findItem, finite, flavor,
  graphemes, gtValue, guard, hash, hexadecimal, hexColor, imei, includes,
  integer, ip, ipv4, ipv6, isbn, isrc, isoDate, isoDateTime, isoDateTimeSecond,
  isoTime, isoTimeSecond, isoTimestamp, isoWeek, jwsCompact, ksuid, length,
  ltValue, mac, mac48, mac64, mapItems, maxBytes, maxCodePoints, maxEntries,
  maxGraphemes, maxLength, maxSize, maxValue, maxWords, metadata, mimeType,
  minBytes, minCodePoints, minEntries, minGraphemes, minLength, minSize,
  minValue, minWords, multipleOf, nanoid, nonEmpty, normalize, notBytes,
  notCodePoints, notEntries, notGraphemes, notLength, notSize, notValue,
  notValues, notWords, octal, parseBoolean, parseJson, partialCheck, pipe,
  rawCheck, rawTransform, readonly, reduceItems, regex, returns, rfcEmail,
  safeInteger, size, slug, someItem, sortItems, startsWith, stringifyJson,
  title, toBigint, toBoolean, toCamelCase, toDate, toKebabCase, toLowerCase,
  toMaxValue, toMinValue, toNumber, toPascalCase, toSnakeCase, toString,
  toUpperCase, transform, trim, trimEnd, trimStart, ulid, url, uuid, value,
  values, words,
  alpha, alphaNumeric, lowercase, uppercase, ascii, semver, json,
  positive, negative, nonNegative, nonPositive, inRange, minDate, maxDate,
  uniqueItems, toUnique, compactItems, reverseItems,
  toTitleCase, truncate, padStart, padEnd, replace,
  fallback, message, flatten, nonNullable, nonOptional, nonNullish
};
