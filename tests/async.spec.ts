import { describe, expect, test } from 'vitest';
import { string, number, object, array, transform, custom, safeParse, parse, VError } from '../src';
import * as A from '../src/async';
import { trim, email, toLowerCase } from '../src/utils';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Context.out (core fix)', () => {
  test('the runtime actually provides the box declared in index.d.ts', () => {
    let seen: unknown;
    safeParse(custom((_v, c) => { seen = c!.out; return true; }, 'x'), 1);
    expect(seen).toEqual({ set: false, value: undefined });
  });

  test('the box is shared by reference through nested validators', () => {
    const boxes: unknown[] = [];
    const leaf = custom((_v, c) => { boxes.push(c!.out); return true; });
    const schema = custom((_v, c) => { boxes.push(c!.out); return true; }, '', [leaf]);
    expect(safeParse(schema, 1).success).toBe(true);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBe(boxes[1]);
  });

  test('root transform publishes through the box; nested transforms stay validation-only', () => {
    expect(parse(transform(string(), (v: string) => v.trim()), '  hi  ')).toBe('hi');
    const nested = object({ a: transform(string(), (v: string) => v + '!') });
    expect(safeParse(nested, { a: 'x' }).success).toBe(true);
    expect((safeParse(nested, { a: 'x' }) as { success: true; data: unknown }).data).toEqual({ a: 'x' });
  });

  test('concurrent validations do not leak transformed output', async () => {
    const slow = (label: string, ms: number) =>
      A.pipeAsync(string(), A.transformAsync(async () => { await delay(ms); return label; }));
    const [a, b] = await Promise.all([
      A.parseAsync(slow('first', 15), 'x'),
      A.parseAsync(slow('second', 1), 'x')
    ]);
    expect(a).toBe('first');
    expect(b).toBe('second');
  });
});

describe('async entry points', () => {
  test('parseAsync / safeParseAsync / isAsync / evaluateAsync work with sync schemas', async () => {
    expect(await A.parseAsync(string(), 'x')).toBe('x');
    expect(await A.isAsync(string(), 'x')).toBe(true);
    expect(await A.isAsync(string(), 1)).toBe(false);
    const ok = await A.safeParseAsync(string(), 'x');
    expect(ok.success).toBe(true);
    const bad = await A.safeParseAsync(string(), 1);
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error).toBeInstanceOf(VError);
      expect(bad.error.issues[0].received).toBe('number');
    }
    await expect(A.parseAsync(string(), 1)).rejects.toBeInstanceOf(VError);
    expect((await A.evaluateAsync(string(), 1)).issues).toHaveLength(1);
  });
});

describe('async-aware combinators', () => {
  test('objectAsync validates fields in parallel with deterministic issue order', async () => {
    const schema = A.objectAsync({
      a: A.customAsync(async () => { await delay(10); return false; }, 'a failed'),
      b: A.customAsync(async () => { await delay(1); return false; }, 'b failed')
    });
    const r = await A.safeParseAsync(schema, {});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map(i => i.message)).toEqual(['a failed', 'b failed']);
  });

  test('objectAsync keeps nested bracket paths; strictAsync reports extras', async () => {
    const schema = A.objectAsync({ user: A.objectAsync({ email: string() }) });
    const r = await A.safeParseAsync(schema, { user: { email: 1 } });
    if (!r.success) expect(r.error.issues[0].path).toBe('["user"]["email"]');

    const strict = A.strictAsync({ a: string() });
    const s = await A.safeParseAsync(strict, { a: 'x', b: 1 });
    expect(s.success).toBe(false);
    if (!s.success) expect(s.error.issues[0].message).toMatch(/Extra keys/);
  });

  test('arrayAsync / tupleAsync validate items and preserve indices', async () => {
    const arr = A.arrayAsync(string());
    expect((await A.safeParseAsync(arr, ['a', 'b'])).success).toBe(true);
    const badArr = await A.safeParseAsync(arr, ['a', 1]);
    if (!badArr.success) expect(badArr.error.issues[0].path).toBe('[1]');

    const tup = A.tupleAsync([string(), number()]);
    expect((await A.safeParseAsync(tup, ['a', 1])).success).toBe(true);
    expect((await A.safeParseAsync(tup, ['a'])).success).toBe(false);
  });

  test('orAsync short-circuits without running later branches', async () => {
    const calls: number[] = [];
    const first = A.customAsync(async () => { calls.push(1); return true; });
    const second = A.customAsync(async () => { calls.push(2); return true; });
    expect((await A.safeParseAsync(A.orAsync(first, second), 'x')).success).toBe(true);
    expect(calls).toEqual([1]);

    const failAll = await A.safeParseAsync(A.orAsync(string(), number()), true);
    expect(failAll.success).toBe(false);
    if (!failAll.success) expect(failAll.error.issues.length).toBeGreaterThanOrEqual(2);
  });

  test('andAsync, optionalAsync and nullableAsync', async () => {
    expect((await A.safeParseAsync(A.andAsync(string(), A.checkAsync(async v => v.length > 2)), 'abc')).success).toBe(true);
    expect((await A.safeParseAsync(A.andAsync(string(), A.checkAsync(async () => false)), 'abc')).success).toBe(false);
    expect((await A.safeParseAsync(A.optionalAsync(string()), undefined)).success).toBe(true);
    expect((await A.safeParseAsync(A.nullableAsync(string()), null)).success).toBe(true);
    expect((await A.safeParseAsync(A.optionalAsync(string()), 1)).success).toBe(false);
    const wrapped = await A.safeParseAsync(A.optionalAsync(string(), 'Custom'), 1);
    if (!wrapped.success) expect(wrapped.error.message).toBe('Custom');
  });

  test('customAsync runs async predicates and async validations', async () => {
    const schema = A.customAsync(
      async v => { await delay(2); return typeof v === 'string'; },
      'not a string',
      [A.checkAsync(async v => v.length > 2, 'too short')]
    );
    expect((await A.safeParseAsync(schema, 'abcd')).success).toBe(true);
    const short = await A.safeParseAsync(schema, 'a');
    if (!short.success) expect(short.error.issues[0].message).toBe('too short');
  });

  test('depth guard stops runaway nesting', async () => {
    let leaf: any = string();
    for (let i = 0; i < 70; i++) leaf = A.objectAsync({ a: leaf });
    let value: any = 'x';
    for (let i = 0; i < 70; i++) value = { a: value };
    const r = await A.safeParseAsync(leaf, value);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Too deep');
  });
});

describe('checks, transforms and composition', () => {
  test('checkAsync / rawCheckAsync / transformAsync', async () => {
    const taken = A.checkAsync(async v => { await delay(2); return v !== 'taken'; }, 'Already taken');
    expect((await A.safeParseAsync(A.customAsync(async () => true, '', [taken]), 'free')).success).toBe(true);
    const raw = A.rawCheckAsync(async (v: any) => typeof v === 'string' ? true : [{ message: 'Nope', expected: 'string', received: typeof v, path: '', origin: 'value' }]);
    expect((await A.safeParseAsync(A.customAsync(async () => true, '', [raw]), 1)).success).toBe(false);
    expect(await A.parseAsync(A.pipeAsync(string(), A.transformAsync(async v => v.toUpperCase())), 'hi')).toBe('HI');
  });

  test('pipeAsync mixes async transforms, sync utils actions and async checks', async () => {
    const unique = A.checkAsync(async v => { await delay(3); return v !== 'taken@b.com'; }, 'Already taken');
    const schema = A.pipeAsync(string(), A.transformAsync(async v => v.trim()), toLowerCase(), email(), unique);
    expect(await A.parseAsync(schema, '  ADA@EXAMPLE.COM  ')).toBe('ada@example.com');
    const bad = await A.safeParseAsync(schema, '  TAKEN@B.COM  ');
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe('Already taken');
  });

  test('nested pipeAsync validates but does not rewrite the parent object', async () => {
    const schema = A.objectAsync({ email: A.pipeAsync(string(), trim(), email()) });
    const r = await A.safeParseAsync(schema, { email: '  a@b.com  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ email: '  a@b.com  ' });
  });

  test('fallbackAsync supports a value or a lazy async factory', async () => {
    expect(await A.parseAsync(A.fallbackAsync(string(), 'guest'), 123)).toBe('guest');
    expect(await A.parseAsync(A.fallbackAsync(string(), async () => { await delay(2); return 'lazy'; }), null)).toBe('lazy');
    expect((await A.safeParseAsync(A.fallbackAsync(string(), 42 as unknown as string), 123)).success).toBe(false);
  });

  test('messageAsync overrides text and preserves nested paths', async () => {
    const schema = A.objectAsync({ a: A.messageAsync(string(), 'Nope') });
    const r = await A.safeParseAsync(schema, { a: 1 });
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Nope');
      expect(r.error.issues[0].path).toBe('["a"]');
    }
  });
});

describe('failure policy and cancellation', () => {
  test('a rejected async validator becomes an issue, not an unhandled rejection', async () => {
    const schema = A.customAsync(async () => { throw new Error('db down'); });
    const r = await A.safeParseAsync(schema, 'x');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Threw: db down');
  });

  test('timeout bounds the whole validation', async () => {
    const slow = A.customAsync(async () => { await delay(40); return true; });
    const r = await A.safeParseAsync(slow, 'x', { timeout: 10 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Threw: Validation timed out');
  });

  test('AbortSignal rejects before work starts', async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await A.safeParseAsync(string(), 'x', { signal: ac.signal });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Threw: Validation aborted');
  });

  test('withTimeout helper rejects slow work', async () => {
    await expect(A.withTimeout(delay(40), 10)).rejects.toThrow('Validation timed out');
    expect(await A.withTimeout(Promise.resolve('ok'), 50)).toBe('ok');
  });
});

describe('resolveAsync (precompute, then validate synchronously)', () => {
  test('deeply awaits plain objects and arrays', async () => {
    const input = {
      name: Promise.resolve('Ada'),
      tags: [Promise.resolve('a'), { deep: Promise.resolve(1) }]
    };
    expect(await A.resolveAsync(input)).toEqual({ name: 'Ada', tags: ['a', { deep: 1 }] });
  });

  test('leaves Date/Map/Set alone and survives cycles', async () => {
    const d = new Date(0);
    const m = new Map([['k', 1]]);
    const cyclic: any = { self: null };
    cyclic.self = cyclic;
    const out: any = await A.resolveAsync({ d, m, cyclic });
    expect(out.d).toBe(d);
    expect(out.m).toBe(m);
    expect(out.cyclic).toBeDefined();
    expect(out.cyclic.self).toBeDefined(); // cycle kept by reference, no hang
  });

  test('resolved values feed straight into sync schemas', async () => {
    const payload = await A.resolveAsync({
      email: Promise.resolve('  ADA@EXAMPLE.COM  '),
      taken: Promise.resolve(false)
    });
    const schema = object({ email: string(), taken: custom(() => true) });
    expect(safeParse(schema, payload).success).toBe(true);
  });
});
