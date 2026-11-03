import { describe, expect, test } from 'vitest';
import * as V from '../src';
import { compile, compileParse } from '../src/compile';
import { email, minLength, trim, toLowerCase } from '../src/utils';

const {
  string, number, boolean, bigint, symbol, date, promise, literal, enums, instance,
  never, any, unknown, nullish, object, array, set, map, record, tuple, optional,
  nullable, or, and, not, lazy, transform, custom, pipe, safeParse, is, min, max,
  integerCheck, fallback
} = V as any;

const show = (v: unknown) => {
  try {
    return typeof v === 'symbol' ? String(v) : JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

// Every case asserts three things: the compiled predicate agrees with is(),
// compileParse() agrees with safeParse() on success/data, and on failure the
// error message and issues are identical.
const same = (label: string, schema: any, values: unknown[]) => {
  const fast = compile(schema);
  const parse = compileParse(schema);
  for (const value of values) {
    const expected = is(schema, value);
    expect(fast(value), `${label} predicate for ${show(value)}`).toBe(expected);
    const got = parse(value);
    const want = safeParse(schema, value);
    expect(got.success, `${label} success for ${show(value)}`).toBe(want.success);
    if (want.success) {
      expect(got).toEqual({ success: true, data: want.data });
    } else {
      expect(got.success).toBe(false);
      if (!got.success) {
        expect(got.error.message).toBe(want.error.message);
        expect(got.error.issues).toEqual(want.error.issues);
      }
    }
  }
};

describe('compile(): predicate parity with is()', () => {
  test('prelude kinds', () => {
    same('string', string(), ['a', '', 1, null, undefined, new String('a')]);
    same('number', number(), [1, NaN, Infinity, '1', null]);
    same('boolean', boolean(), [true, false, 0, 'true']);
    same('bigint', bigint(), [1n, 1, '1']);
    same('symbol', symbol(), [Symbol('x'), 'x']);
    same('date', date(), [new Date(0), new Date('invalid'), 0]);
    same('promise', promise(), [Promise.resolve(1), {}, null]);
    same('literal', literal(5), [5, '5', 6]);
    same('enums', enums(['a', 'b']), ['a', 'c', 1]);
    same('instance', instance(Date), [new Date(), {}]);
    same('never', never(), [1, null]);
    same('any', any(), [1, null, undefined]);
    same('unknown', unknown(), [1, 'x']);
    same('nullish', nullish(), [null, undefined, 0]);
  });

  test('refinements on leaves', () => {
    same('string+min', string('', [min(2)]), ['ab', 'a', 1, null]);
    same('number+integer', number('', [integerCheck(), min(0), max(10)]), [5, 5.5, -1, 11, 'x']);
    same('email', string('', [email()]), ['ada@example.com', 'nope', 1]);
    same('custom message', string('bad string'), ['a', 1]);
  });

  test('object, strict object and symbol keys', () => {
    const User = object({ name: string(), age: number('', [integerCheck(), min(0)]) });
    same('object', User, [
      { name: 'Ada', age: 36 }, { name: 'Ada', age: -1 }, { name: 'Ada' }, {},
      null, undefined, 'x', 42, [], { name: 'Ada', age: 36, extra: true }
    ]);
    const Strict = object({ a: string() }, '', [], true);
    same('strict', Strict, [{ a: 'x' }, { a: 'x', b: 1 }, {}, { b: 1 }, null, []]);
    const sym = Symbol('s');
    const WithSymbol = object({ [sym]: string(), plain: number() } as any);
    same('symbol keys', WithSymbol, [{ [sym]: 'x', plain: 1 }, { [sym]: 1, plain: 1 }, { plain: 1 }]);
    // `Object.hasOwn` semantics: inherited properties never satisfy a key.
    const inherited = Object.create({ name: 'Ada' });
    inherited.age = 1;
    same('inherited', User, [inherited]);
  });

  test('array, set, tuple, record, map', () => {
    same('array', array(number()), [[1, 2], [1, 'x'], [], 'x', null]);
    same('set', set(number()), [new Set([1, 2]), new Set([1, 'x']), [], null]);
    same('tuple', tuple([string(), number()]), [['a', 1], ['a'], ['a', 1, 2], ['a', 'b'], null]);
    same('record', record(string(), number()), [{ a: 1 }, { a: 'x' }, { a: 1, b: 2 }, {}, null]);
    same('map', map(string(), number()), [new Map([['a', 1]]), new Map([['a', 'x']]), new Map(), {}, null]);
  });

  test('optional / nullable wrappers', () => {
    same('optional', optional(string()), [undefined, 'x', 1]);
    same('nullable', nullable(string()), [null, 'x', 1]);
    same('optional refined inner', optional(string('', [min(2)])), [undefined, 'ab', 'a', 1]);
    same('optional own refinement', optional(string(), 'msg', [min(2)]), [undefined, 'ab', 'a', 1]);
    same('optional message', optional(string(), 'expected or absent'), [undefined, 'x', 1]);
    same('nested optional of nullable', optional(nullable(optional(number()))), [
      undefined, null, 1, 'x'
    ]);
  });

  test('nested structures keep issue identity', () => {
    const Schema = object({
      user: object({ name: string('bad name'), tags: array(string('bad tag')) }),
      meta: optional(record(string(), number('bad meta')))
    });
    same('nested', Schema, [
      { user: { name: 'Ada', tags: ['a'] } },
      { user: { name: 'Ada', tags: ['a', 1] } },
      { user: { name: 1, tags: [] } },
      { user: { name: 'Ada' } },
      { user: { name: 'Ada', tags: [] }, meta: { a: 1 } },
      { user: { name: 'Ada', tags: [] }, meta: { a: 'x' } },
      {}
    ]);
  });
});

describe('compile(): fallbacks keep the generic answer', () => {
  test('or / and / not', () => {
    same('or', or(string(), number()), ['x', 1, true, null]);
    same('and', and(string(), string()), ['x', 1]);
    same('not', not(string()), ['x', 1]);
  });

  test('lazy, custom, pipe and transform', () => {
    const Tree: any = lazy(() => object({ value: number(), kids: array(Tree) }));
    same('lazy', Tree, [
      { value: 1, kids: [] },
      { value: 1, kids: [{ value: 2, kids: [] }] },
      { value: 1, kids: [{ value: 'x', kids: [] }] },
      {}
    ]);
    same('custom', custom((v: any) => v > 2, 'too small'), [3, 1]);
    same('pipe', pipe(string(), trim(), toLowerCase()), [' A ', 1]);
    same('root transform', transform(string(), (s: any) => s.trim()), [' a ', 1]);
    same('nested transform', object({ n: transform(string(), (s: any) => s.trim()) }), [
      { n: ' a ' }, { n: 1 }
    ]);
  });

  test('a fallback inside a compiled composite still uses the generic tree', () => {
    const Schema = object({
      id: number('', [integerCheck()]),
      status: or(literal('on'), literal('off')),
      note: optional(pipe(string(), trim()))
    });
    same('mixed', Schema, [
      { id: 1, status: 'on' },
      { id: 1, status: 'maybe' },
      { id: 1.5, status: 'on' },
      { id: 1, status: 'on', note: ' hi ' },
      null
    ]);
  });

  test('uncompilable roots fall back to safeParse() entirely', () => {
    const Root = transform(string(), (s: any) => s.trim());
    const parse = compileParse(Root);
    expect(parse(' x ')).toEqual(safeParse(Root, ' x '));
    expect(compile(Root)(' x ')).toBe(true);
    expect(compileParse(or(string(), number()))(1)).toEqual(safeParse(or(string(), number()), 1));
  });

  test('the depth guard is preserved for generic subtrees', () => {
    let deep: any = number();
    for (let i = 0; i < 80; i++) deep = object({ next: deep });
    let value: any = 1;
    for (let i = 0; i < 80; i++) value = { next: value };
    same('depth', deep, [value]);
    expect(compile(deep)(value)).toBe(is(deep, value));
  });
});

describe('compile(): API contract', () => {
  test('the predicate is cached per schema object', () => {
    const S = object({ a: string() });
    expect(compile(S)).toBe(compile(S));
    expect(compileParse(S)).not.toBe(compileParse(S)); // a small wrapper per call
  });

  test('non-validators are rejected', () => {
    expect(() => compile(42 as any)).toThrow(TypeError);
    expect(() => compile(null as any)).toThrow(TypeError);
    expect(() => compileParse({} as any)).toThrow(TypeError);
  });

  test('compileParse success data mirrors safeParse for untouched roots', () => {
    const S = object({ a: string(), b: optional(number()) });
    expect(compileParse(S)({ a: 'x' })).toEqual(safeParse(S, { a: 'x' }));
  });

  test('compile() ignores transforms below the root (validation only)', () => {
    const S = object({ n: transform(string(), (s: any) => s.trim()) });
    expect(compileParse(S)({ n: ' x ' })).toEqual({ success: true, data: { n: ' x ' } });
    expect(safeParse(S, { n: ' x ' })).toEqual({ success: true, data: { n: ' x ' } });
  });

  test('custom validators see a root context inside a compiled subtree', () => {
    // Documented trade-off: the compiled tree carries no path strings, so a
    // fallback node is called with a root context. Validity is unchanged.
    const seen: string[] = [];
    const S = object({ a: custom((_v: unknown, c: any) => { seen.push(c.path); return true; }) });
    expect(compile(S)({ a: 1 })).toBe(true);
    expect(seen).toEqual(['']);
  });

  test('a plain refinement function is accepted and matches is()', () => {
    const check: any = () => [];
    same('function', check, [1, 'x', null]);
    expect(compile(check)).toBe(compile(check));
  });

  test('fallback()/message() utilities still compile', () => {
    same('fallback', fallback(string(), 'guest'), [undefined, null, 'x']);
    same('string message', string('', [minLength(2)]), ['ab', 'a']);
  });
});
