import { describe, expect, test, vi } from 'vitest';
import * as uvld from './src';
import {
  string, boolean, number, func, symbol, bigint, integer, date, promise,
  never, any, unknown as unknownSchema, nullish, literal, instance, enums, optional, nullable,
  custom, record, map, array, set, object, strict, tuple, min, max, or, and,
  not, lazy, transform, is, parse, safeParse, define, VError,
  type Validator, type Issue, type Infer
} from './src';

/** Assert success and return the parsed data. */
const ok = <T>(schema: Validator<T>, value: unknown): T => {
  const r = safeParse(schema, value);
  expect(r.success).toBe(true);
  if (!r.success) throw new Error(`expected success, got: ${r.error.message}`);
  return r.data;
};

/** Assert failure and return the VError for detailed assertions. */
const fail = (schema: Validator<any>, value: unknown): VError => {
  const r = safeParse(schema, value);
  expect(r.success).toBe(false);
  if (r.success) throw new Error('expected failure');
  return r.error;
};

describe('public surface', () => {
  test('exports all 38 runtime symbols, including define and unknown', () => {
    expect(Object.keys(uvld)).toHaveLength(38);
    expect(typeof define).toBe('function');
    expect(typeof unknownSchema).toBe('function');
    expect(typeof VError).toBe('function');
  });

  test('define() is a usable extension point with the uniform signature', () => {
    const uuid = define<string>('uuid', v => typeof v === 'string' && v.length === 36);
    expect(ok(uuid(), '123e4567-e89b-12d3-a456-426614174000')).toHaveLength(36);
    expect(fail(uuid('Not a uuid'), 'x').issues[0].message).toBe('Not a uuid');
  });
});

describe('primitives', () => {
  test('string / boolean / number', () => {
    expect(ok(string(), 'hi')).toBe('hi');
    expect(ok(boolean(), false)).toBe(false);
    expect(ok(number(), 1.5)).toBe(1.5);
    for (const [s, v] of [[string(), 1], [boolean(), 'x'], [number(), '1']] as const) fail(s, v);
  });

  test('number() rejects NaN and infinities; integer() rejects fractions', () => {
    expect(fail(number(), NaN).issues[0].message).toMatch(/Expected number/);
    fail(number(), Infinity);
    fail(number(), -Infinity);
    expect(ok(integer(), 42)).toBe(42);
    fail(integer(), 4.2);
    fail(integer(), NaN);
  });

  test('func / symbol / bigint / unknown / any / nullish / never', () => {
    expect(ok(func(), () => 1)).toBeTypeOf('function');
    const s = Symbol('s');
    expect(ok(symbol(), s)).toBe(s);
    expect(ok(bigint(), 10n)).toBe(10n);
    expect(ok(unknownSchema(), { anything: true })).toEqual({ anything: true });
    expect(ok(any(), null)).toBe(null);
    expect(ok(nullish(), undefined)).toBe(undefined);
    expect(ok(nullish(), null)).toBe(null);
    fail(nullish(), 0);
    fail(nullish(), '');
    fail(never(), 1);
    fail(string(), undefined);
  });

  test('date() rejects invalid dates; promise() accepts thenables', () => {
    expect(ok(date(), new Date('2024-01-01'))).toBeInstanceOf(Date);
    fail(date(), new Date('not a date'));
    fail(date(), '2024-01-01');
    ok(promise(), Promise.resolve(1));
    ok(promise(), { then() { /* thenable */ } });
    fail(promise(), {});
  });

  test('object()-like inputs are rejected by primitive schemas', () => {
    fail(string(), new String('x'));
    fail(number(), new Number(1));
  });
});

describe('literals, instances, enums', () => {
  test('literal uses Object.is (NaN and -0 handled)', () => {
    expect(ok(literal(NaN), NaN)).toBeNaN();
    fail(literal(0), -0); // Object.is(0, -0) === false
    ok(literal('admin'), 'admin');
    fail(literal('admin'), 'user');
    ok(literal(Symbol.for('k')), Symbol.for('k'));
    ok(literal(1n), 1n);
    ok(literal(null), null);
    ok(literal(undefined), undefined);
  });

  test('literal accepts custom message + validations uniformly', () => {
    const s = literal(2, 'must be two', [number()]);
    ok(s, 2);
    expect(fail(s, 1).issues[0].message).toBe('must be two');
  });

  test('instance validates the constructor up front', () => {
    class Foo { }
    ok(instance(Foo), new Foo());
    fail(instance(Foo), {});
    expect(() => instance(42 as any)).toThrow(TypeError);
    expect(() => instance((() => 1) as any)).toThrow(TypeError);
  });

  test('enums requires an array and supports NaN via SameValueZero', () => {
    ok(enums(['red', 'green', 'blue'] as const), 'green');
    fail(enums(['red', 'green'] as const), 'yellow');
    ok(enums([NaN, 1]), NaN);
    expect(() => enums('abcd' as any)).toThrow(TypeError);
  });
});

describe('messages, issues and paths', () => {
  test('default and custom messages', () => {
    expect(fail(string(), 1).message).toBe('Expected string, got number');
    expect(fail(string('Need a string'), 1).message).toBe('Need a string');
    expect(fail(object({}), null).message).toBe('Expected object, got null');
  });

  test('every issue has all five fields and a type tag (never the raw value)', () => {
    const secret = { password: 'hunter2' };
    const issue: Issue = fail(string(), secret).issues[0];
    expect(issue).toEqual({
      message: 'Expected string, got object',
      expected: 'string',
      received: 'object',
      path: '',
      origin: 'value'
    });
    expect(JSON.stringify(issue)).not.toContain('hunter2');
  });

  test('paths are unambiguous bracket segments', () => {
    const s = object({ 'a.b': array(object({ x: string() })) });
    expect(fail(s, { 'a.b': [{ x: 1 }] }).issues[0].path).toBe('["a.b"][0]["x"]');
    expect(fail(array(string()), ['ok', 1]).issues[0].path).toBe('[1]');
  });

  test('VError exposes issues and a useful name/message', () => {
    const e = fail(object({ a: string(), b: string() }), { a: 1, b: 2 });
    expect(e).toBeInstanceOf(VError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('VError');
    expect(e.issues).toHaveLength(2);
    expect(e.message).toBe(e.issues[0].message);
  });
});

describe('refinements / validations (uniform signature everywhere)', () => {
  test('refinements may return true, false, a string or a partial issue', () => {
    ok(string('', [v => (v as string).length > 2]), 'abc');
    const a = fail(string('', [v => (v as string).length > 5]), 'abc');
    expect(a.issues[0]).toMatchObject({ message: 'Invalid value', expected: 'unknown', received: 'string', path: '' });
    const b = fail(string('', [() => 'too short']), 'abc');
    expect(b.issues[0].message).toBe('too short');
    const c = fail(string('', [() => ({ message: 'too short', origin: 'custom' })]), 'abc');
    expect(c.issues[0]).toMatchObject({ message: 'too short', origin: 'custom', received: 'string', path: '' });
    expect(fail(any('', [() => false]), 1).issues[0].message).toBe('Invalid value');
  });

  test('every factory accepts (message, validations[]) — including min/max/not', () => {
    ok(min(2, 'too small', [string()]), 'abc');
    expect(fail(min(5, 'too small', [string()]), 'ab').message).toBe('too small');
    ok(max(5, 'too big', [string()]), 'abc');
    expect(fail(not(string(), 'no strings', [any()]), 'x').message).toBe('no strings');
    ok(not(string(), '', [number()]), 123);
    ok(optional(string(), '', [string()]), undefined);
    ok(nullable(string(), '', [string()]), null);
    ok(array(string(), '', [array(string())]), ['a']);
    ok(tuple([string()], '', [array(string())]), ['a']);
  });

  test('custom() validates its own predicate and can chain validations', () => {
    const even = custom<number>(v => v % 2 === 0, 'must be even', [number()]);
    ok(even, 4);
    expect(fail(even, 3).message).toBe('must be even');
    fail(even, '3');
  });
});

describe('wrappers: optional / nullable', () => {
  test('undefined / null short-circuit', () => {
    expect(ok(optional(string()), undefined)).toBe(undefined);
    expect(ok(nullable(string()), null)).toBe(null);
    ok(optional(string()), 'x');
    ok(nullable(string()), 'x');
  });

  test('nested issues are preserved (paths, count, origins)', () => {
    const e = fail(optional(object({ a: string(), b: string() })), { a: 1, b: 2 });
    expect(e.issues).toHaveLength(2);
    expect(e.issues.map(i => i.path)).toEqual(['["a"]', '["b"]']);
    expect(e.issues[0].origin).toBe('value');
  });

  test('an explicit message overrides nested messages', () => {
    expect(fail(optional(string(), 'optional but wrong'), 1).issues[0].message).toBe('optional but wrong');
  });

  test('validations still run for non-empty values', () => {
    const s = optional(string(), '', [v => (v as string).length > 3]);
    ok(s, 'long');
    fail(s, 'no');
  });
});

describe('composites', () => {
  test('array validates items with index paths', () => {
    ok(array(number()), [1, 2, 3]);
    expect(fail(array(number()), [1, 'x']).issues[0].path).toBe('[1]');
    fail(array(string()), 'not an array');
  });

  test('tuple checks length and every position', () => {
    ok(tuple([string(), number()]), ['a', 1]);
    expect(fail(tuple([string(), number()]), ['a']).issues[0].message).toMatch(/Tuple length 2 != 1/);
    expect(fail(tuple([string(), number()]), ['a', 'b']).issues[0].path).toBe('[1]');
  });

  test('object: plain objects only, own properties only', () => {
    ok(object({ a: string() }), { a: 'x', extra: 1 });
    fail(object({ a: string() }), {});
    fail(object({}), new Date());
    fail(object({}), new Map());
    fail(object({}), new Set());
    fail(object({}), Promise.resolve());
    fail(object({}), []);
    fail(object({}), null);
    ok(object({}), Object.create(null));
  });

  test('object: prototype chain cannot satisfy a required key', () => {
    (Object.prototype as any).injected = 'from prototype';
    try {
      fail(object({ injected: string() }), {});
    } finally {
      delete (Object.prototype as any).injected;
    }
  });

  test('object supports symbol keys in the schema', () => {
    const k = Symbol('k');
    ok(object({ [k]: number() }), { [k]: 1 });
    expect(fail(object({ [k]: number() }), { [k]: 'x' }).issues[0].path).toBe('["Symbol(k)"]');
  });

  test('strict reports extra keys AND field errors (no early return)', () => {
    const s = strict({ a: string(), b: number() });
    ok(s, { a: 'x', b: 1 });
    const e = fail(s, { a: 1, b: 'x', extra: true });
    expect(e.issues).toHaveLength(3);
    expect(e.issues[0]).toMatchObject({ message: 'Extra keys: extra', origin: 'key' });
    expect(e.issues.slice(1).map(i => i.path)).toEqual(['["a"]', '["b"]']);
  });

  test('strict sees symbol and non-enumerable extra keys', () => {
    const k = Symbol('extra');
    expect(fail(strict({ a: string() }), { a: 'x', [k]: 1 }).issues[0].message).toContain('Symbol(extra)');
    const o = { a: 'x' };
    Object.defineProperty(o, 'hidden', { value: 1, enumerable: false });
    fail(strict({ a: string() }), o);
  });

  test('record validates string AND symbol keys (no vacuous passes)', () => {
    const k = Symbol('k');
    ok(record(symbol(), number()), { [k]: 1 });
    const e = fail(record(symbol(), number()), { [k]: 'not a number' });
    expect(e.issues[0].path).toBe('["Symbol(k)"]');
    expect(fail(record(string(), number()), { a: 'x' }).issues[0].origin).toBe('value');
    expect(fail(record(symbol(), number()), { a: 1 }).issues[0].origin).toBe('key');
    fail(record(string(), number()), [1, 2]);
    fail(record(string(), number()), new Date());
  });

  test('map / set validate entries with index paths and key origins', () => {
    ok(map(string(), number()), new Map([['a', 1]]));
    expect(fail(map(string(), number()), new Map([['a', 'x']])).issues[0].path).toBe('[0]');
    expect(fail(map(symbol(), number()), new Map([['a', 1]])).issues[0].origin).toBe('key');
    ok(set(number()), new Set([1, 2]));
    expect(fail(set(number()), new Set([1, 'x'])).issues[0].path).toBe('[1]');
    fail(map(string(), number()), {});
    fail(set(number()), []);
  });
});

describe('constraints: min / max', () => {
  test('numbers, strings, arrays, Map and Set', () => {
    ok(min(5), 5);
    ok(min(5), 'hello');
    ok(min(2), [1, 2]);
    ok(min(2), new Map([['a', 1], ['b', 2]]));
    ok(min(2), new Set([1, 2]));
    ok(max(3), 'abc');
    ok(max(2), new Set([1, 2]));
    fail(min(5), 4);
    fail(max(2), [1, 2, 3]);
  });

  test('custom message works and never throws (regression: 2nd arg was validations)', () => {
    ok(min(5, 'too short'), 'hello');
    expect(fail(min(5, 'too short'), 'hi').message).toBe('too short');
    ok(max(5, 'too long'), 'hi');
    expect(fail(max(2, 'too long'), 'hello').message).toBe('too long');
    expect(fail(min(3), 'x').issues[0].message).toBe('Min 3');
  });

  test('unsupported types fail cleanly without coercion or exceptions', () => {
    for (const v of [null, true, false, {}, Symbol('s'), undefined, () => 1]) {
      const r = safeParse(min(1), v);
      expect(r.success).toBe(false);
      expect(safeParse(max(1), v).success).toBe(false);
    }
    expect(() => safeParse(min(5), Symbol('s'))).not.toThrow();
  });
});

describe('combinators', () => {
  test('or(): per-branch results, not issue counts (regression)', () => {
    ok(or(string(), number()), 'x');
    ok(or(string(), number()), 1);
    fail(or(string(), number()), true);
    fail(or(array(string()), number()), [1, 2, 3]); // 3 issues from one branch
    fail(or(object({ a: string(), b: string() }), string()), { a: 1, b: 2 });
    ok(or(array(string()), any()), [1, 2]); // a successful branch wins
    fail(or(), 1); // zero schemas is never valid
    const e = fail(or(string(), number()), true);
    expect(e.issues).toHaveLength(2); // all branch issues aggregated
  });

  test('or() short-circuits after the first successful branch', () => {
    const spy = vi.fn(() => []);
    ok(or(string(), spy as any), 'x');
    expect(spy).not.toHaveBeenCalled();
  });

  test('and() collects issues from every schema', () => {
    ok(and(string(), min(3)), 'hello');
    expect(fail(and(string(), min(10)), 1).issues).toHaveLength(2);
  });

  test('not() inverts a schema and honours message/validations', () => {
    ok(not(string()), 123);
    fail(not(string()), 'x');
    expect(fail(not(string(), 'no strings'), 'x').message).toBe('no strings');
  });

  test('lazy() resolves once and supports recursive schemas', () => {
    const resolver = vi.fn(() => string());
    const s = lazy(resolver);
    ok(s, 'a');
    ok(s, 'b');
    expect(resolver).toHaveBeenCalledTimes(1);

    const Node: Validator<any> = object({ id: number(), children: array(lazy(() => Node)) });
    ok(Node, { id: 1, children: [{ id: 2, children: [] }] });
    expect(fail(Node, { id: 1, children: [{ id: 'x', children: [] }] }).issues[0].path)
      .toBe('["children"][0]["id"]');
  });

  test('transform() returns transformed data at the root, applied once', () => {
    const upper = vi.fn((s: string) => s.toUpperCase());
    const s = transform(string(), upper);
    expect(ok(s, 'hello')).toBe('HELLO');
    expect(upper).toHaveBeenCalledTimes(1);
    expect(parse(s, 'hi')).toBe('HI');
    expect(fail(s, 1).issues[0].message).toMatch(/Threw/); // non-string has no toUpperCase
  });

  test('transform() nested in an object affects validation only (documented)', () => {
    const s = object({ name: transform(string(), (x: string) => x.trim()) });
    const value = { name: '  ok  ' };
    expect(ok(s, value)).toBe(value);
  });
});

describe('entry points & robustness', () => {
  test('is() is a type-guard-like boolean and never throws', () => {
    expect(is(string(), 'x')).toBe(true);
    expect(is(string(), 1)).toBe(false);
    expect(is(custom(() => { throw new Error('boom'); }), 1)).toBe(false);
  });

  test('parse() returns the original reference and throws VError on failure', () => {
    const value = { a: 1 };
    expect(parse(object({ a: number() }), value)).toBe(value);
    expect(() => parse(string(), 1)).toThrow(VError);
    try { parse(string(), 1); } catch (e) {
      expect((e as VError).issues[0]).toMatchObject({ expected: 'string', received: 'number' });
    }
  });

  test('safeParse() is genuinely safe: validator exceptions become issues', () => {
    const boom = custom(() => { throw new Error('kaboom'); });
    const e = fail(boom, 1);
    expect(e.issues[0].message).toContain('kaboom');
    expect(e.issues[0].expected).toBe('validator');
    expect(() => safeParse(min(5), Symbol('s'))).not.toThrow();
    expect(() => safeParse(instance(42 as any), {})).toThrow(); // schema error, not data error
    const getter = { get a() { throw new Error('getter'); } };
    expect(() => safeParse(object({ a: string() }), getter)).not.toThrow();
  });

  test('circular data cannot blow the stack', () => {
    const Node: Validator<any> = object({ id: number(), next: lazy(() => Node) });
    const circular: any = { id: 1 };
    circular.next = circular;
    const r = safeParse(Node, circular);
    expect(r.success).toBe(false);
  });

  test('origin propagates through or / and / lazy / transform / composites', () => {
    const s = record(or(number(), boolean()) as Validator<any>, number());
    expect(fail(s, { a: 1 }).issues.every(i => i.origin === 'key')).toBe(true);
    const s2 = record(lazy(() => symbol()), number());
    expect(fail(s2, { a: 1 }).issues[0].origin).toBe('key');
  });

  test('type inference is usable at runtime boundaries', () => {
    const User = object({ name: string(), age: number(), tags: array(string()) });
    type User = Infer<typeof User>;
    const parsed: User = parse(User, { name: 'A', age: 1, tags: [] });
    expect(parsed.name).toBe('A');
    let v: unknown = parsed.name;
    if (is(string(), v)) {
      const narrowed: string = v;
      expect(narrowed).toBe('A');
    }
  });
});
