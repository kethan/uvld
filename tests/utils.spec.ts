import { describe, expect, test } from 'vitest';
import * as U from '../src/utils';
import { string, number, object, array, safeParse, parse, transform as coreTransform, VError } from '../src';

type CheckFn = (value: any) => any;
const mod = U as unknown as Record<string, any>;

const accepts = (check: CheckFn, value: unknown) => expect(check(value)).toBe(true);
const rejects = (check: CheckFn, value: unknown, message?: string) => {
  const result = check(value);
  expect(result).not.toBe(true);
  if (message !== undefined) expect(result).toBe(message);
};

// All 128 names requested by the original feature list.
const REQUESTED = (`args base64 bic brand bytes check checkItems codePoints creditCard cuid2 decimal
description digits domain email emoji empty endsWith entries everyItem examples excludes filterItems
findItem finite flavor graphemes gtValue guard hash hexadecimal hexColor imei includes integer ip
ipv4 ipv6 isbn isrc isoDate isoDateTime isoDateTimeSecond isoTime isoTimeSecond isoTimestamp
isoWeek jwsCompact ksuid length ltValue mac mac48 mac64 mapItems maxBytes maxCodePoints maxEntries
maxGraphemes maxLength maxSize maxValue maxWords metadata mimeType minBytes minCodePoints
minEntries minGraphemes minLength minSize minValue minWords multipleOf nanoid nonEmpty normalize
notBytes notCodePoints notEntries notGraphemes notLength notSize notValue notValues notWords octal
parseBoolean parseJson partialCheck rawCheck rawTransform readonly reduceItems regex returns
rfcEmail safeInteger size slug someItem sortItems startsWith stringifyJson title toBigint toBoolean
toCamelCase toDate toKebabCase toLowerCase toMaxValue toMinValue toNumber toPascalCase toSnakeCase
toString toUpperCase transform trim trimEnd trimStart ulid url uuid value values words`)
  .trim().split(/\s+/);

describe('utils entry point', () => {
  test('exports all requested names plus pipe, with no missing pieces', () => {
    expect(REQUESTED).toHaveLength(128);
    expect(REQUESTED.filter(n => !(n in U))).toEqual([]);
    expect(Object.keys(U)).toHaveLength(129); // 128 + pipe
    expect(typeof U.pipe).toBe('function');
  });

  test('utils.transform is the core transform', () => {
    expect(U.transform).toBe(coreTransform);
  });

  test('utils are tree-shakeable: core is not bundled into the utils entry', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/utils.js', import.meta.url), 'utf8');
    expect(source).toContain("from './index.js'");
  });
});

describe('format checks', () => {
  const table: [string, unknown, unknown][] = [
    ['base64', 'aGVsbG8=', 'not base64!!'],
    ['bic', 'DEUTDEFF', 'deut'],
    ['creditCard', '4111 1111 1111 1111', '4111 1111 1111 1112'],
    ['cuid2', 'a12345678901234567890123', 'A12345678901234567890123'],
    ['decimal', '-12.5', '12.5.5'],
    ['digits', '12345', '12a45'],
    ['domain', 'example.co.uk', 'localhost'],
    ['email', 'ada@example.com', 'ada@example'],
    ['rfcEmail', 'a.b+c@example.com', 'a b@example.com'],
    ['emoji', '😀', 'abc'],
    ['hexadecimal', 'ff00AA', 'ff00ZZ'],
    ['hexColor', '#ff00aa', '#12345'],
    ['imei', '490154203237518', '490154203237519'],
    ['ip', '192.168.1.1', '999.1.1.1'],
    ['ipv4', '192.168.1.1', '256.1.1.1'],
    ['ipv6', '2001:db8::1', '2001:::1'],
    ['isbn', '0-306-40615-2', '0-306-40615-3'],
    ['isrc', 'USRC17607839', 'usrc17607839'],
    ['isoDate', '2024-01-31', '2024-13-31'],
    ['isoDateTime', '2024-01-31T12:30', '2024-01-31 12:30'],
    ['isoDateTimeSecond', '2024-01-31T12:30:45', '2024-01-31T12:30'],
    ['isoTime', '12:30', '25:30'],
    ['isoTimeSecond', '12:30:45', '12:30'],
    ['isoTimestamp', '2024-01-31T12:30:45Z', '2024-01-31T12:30:45'],
    ['isoWeek', '2024-W05', '2024-W55'],
    ['jwsCompact', 'aaa.bbb.ccc', 'aaa.bbb'],
    ['ksuid', '123456789012345678901234567', 'short'],
    ['mac', '00:1a:2b:3c:4d:5e', 'zz:1a:2b:3c:4d:5e'],
    ['mac48', '00:1a:2b:3c:4d:5e', '00:1a:2b:3c:4d'],
    ['mac64', '00:1a:2b:3c:4d:5e:6f:70', '00:1a:2b:3c:4d:5e'],
    ['mimeType', 'application/json; charset=utf-8', 'not-a-mime'],
    ['octal', '707', '789'],
    ['slug', 'hello-world', 'Hello World'],
    ['ulid', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'not-a-ulid'],
    ['url', 'https://example.com/path', 'example.com'],
    ['uuid', '550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid']
  ];

  test.each(table)('%s accepts a valid value and rejects an invalid one', (name, good, bad) => {
    const factory = mod[name] as (message?: string) => CheckFn;
    accepts(factory(), good);
    rejects(factory(), bad);
    rejects(factory('Custom message'), bad, 'Custom message');
  });

  test('nanoid and hash are parameterised', () => {
    accepts(U.nanoid(), 'abcdefghijklmnopqrstu'); // 21 chars
    rejects(U.nanoid(), 'short');
    accepts(U.nanoid(8), 'abcdefgh');
    rejects(U.nanoid(8), 'abcdefghi');
    accepts(U.hash(), 'a'.repeat(64)); // sha256
    rejects(U.hash(), 'a'.repeat(40));
    accepts(U.hash('sha1'), 'a'.repeat(40));
    accepts(U.hash('md5'), 'a'.repeat(32));
  });

  test('emoji handles ZWJ sequences and skin-tone modifiers', () => {
    accepts(U.emoji(), '👍🏽');
    accepts(U.emoji(), '👨‍👩‍👧');
    rejects(U.emoji(), 'hello');
  });

  test('checksum-based validators reject look-alikes', () => {
    rejects(U.creditCard(), '4111111111111112');
    rejects(U.imei(), '490154203237519');
    rejects(U.isbn(), '9783161484101');
    accepts(U.isbn(), '9783161484100');
  });
});

describe('measurement constraints', () => {
  const cases: [string, unknown, number][] = [
    ['Length', 'hello', 5],
    ['Bytes', 'é', 2],
    ['CodePoints', '😀', 1],
    ['Graphemes', '👍🏽', 1],
    ['Words', 'one two three', 3],
    ['Size', new Set([1, 2]), 2],
    ['Entries', { a: 1, b: 2 }, 2],
    ['Value', 10, 10]
  ];

  test.each(cases)('%s: exact / min / max / not', (label, value, n) => {
    const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
    const k = label.charAt(0).toLowerCase() + label.slice(1);
    const suffix = cap(k);
    const exact = mod[k] as (b: number) => CheckFn;
    const min = mod['min' + suffix] as (b: number) => CheckFn;
    const max = mod['max' + suffix] as (b: number) => CheckFn;
    const not = mod['not' + suffix] as (b: number) => CheckFn;
    accepts(exact(n), value);
    rejects(exact(n + 1), value);
    accepts(min(n), value);
    rejects(min(n + 1), value);
    accepts(max(n), value);
    rejects(max(n - 1), value);
    accepts(not(n + 1), value);
    rejects(not(n), value);
  });

  test('gtValue / ltValue / multipleOf / finite / integer / safeInteger', () => {
    accepts(U.gtValue(9), 10);
    rejects(U.gtValue(10), 10);
    accepts(U.ltValue(11), 10);
    rejects(U.ltValue(10), 10);
    accepts(U.multipleOf(3), 9);
    rejects(U.multipleOf(3), 10);
    accepts(U.finite(), 1);
    rejects(U.finite(), Infinity);
    rejects(U.finite(), NaN);
    accepts(U.integer(), 4);
    rejects(U.integer(), 4.2);
    accepts(U.safeInteger(), Number.MAX_SAFE_INTEGER);
    rejects(U.safeInteger(), Number.MAX_SAFE_INTEGER + 1);
  });

  test('empty / nonEmpty / value / notValue / values / notValues', () => {
    accepts(U.empty(), '');
    accepts(U.empty(), []);
    rejects(U.empty(), 'x');
    accepts(U.nonEmpty(), 'x');
    rejects(U.nonEmpty(), '');
    accepts(U.value(2), 2);
    rejects(U.value(2), 3);
    accepts(U.notValue(2), 3);
    rejects(U.notValue(2), 2);
    accepts(U.values([1, 2]), 2);
    rejects(U.values([1, 2]), 3);
    accepts(U.notValues([1, 2]), 3);
    rejects(U.notValues([1, 2]), 2);
  });

  test('string membership checks', () => {
    accepts(U.includes('at'), 'cat');
    rejects(U.includes('zz'), 'cat');
    accepts(U.excludes('zz'), 'cat');
    rejects(U.excludes('at'), 'cat');
    accepts(U.startsWith('ca'), 'cat');
    rejects(U.startsWith('at'), 'cat');
    accepts(U.endsWith('at'), 'cat');
    rejects(U.endsWith('ca'), 'cat');
    accepts(U.regex(/^\d+$/), '123');
    rejects(U.regex(/^\d+$/), 'abc');
  });

  test('custom messages are honoured on every constraint', () => {
    rejects(U.minLength(10, 'too short'), 'x', 'too short');
    rejects(U.maxValue(3, 'too big'), 4, 'too big');
    rejects(U.multipleOf(3, 'wrong step'), 4, 'wrong step');
  });
});

describe('transform actions', () => {
  const table: [string, unknown, unknown][] = [
    ['trim', '  x  ', 'x'],
    ['trimStart', '  x  ', 'x  '],
    ['trimEnd', '  x  ', '  x'],
    ['toLowerCase', 'ABC', 'abc'],
    ['toUpperCase', 'abc', 'ABC'],
    ['toCamelCase', 'hello world', 'helloWorld'],
    ['toPascalCase', 'hello world', 'HelloWorld'],
    ['toKebabCase', 'HelloWorld', 'hello-world'],
    ['toSnakeCase', 'HelloWorld', 'hello_world'],
    ['normalize', 'e\u0301', 'é'],
    ['toNumber', '42', 42],
    ['toBoolean', 0, false],
    ['parseBoolean', 'yes', true],
    ['toBigint', '42', 42n],
    ['toString', 42, '42'],
    ['toMinValue', 3, 5],
    ['toMaxValue', 9, 5],
    ['parseJson', '{"a":1}', { a: 1 }],
    ['stringifyJson', { a: 1 }, '{"a":1}']
  ];

  test.each(table)('%s transforms a value', (name, input, expected) => {
    const factory = mod[name] as (...args: any[]) => (v: any) => any;
    const action = name === 'toMinValue' ? factory(5)
      : name === 'toMaxValue' ? factory(5) : factory();
    expect(action(input)).toEqual(expected);
    expect((action as any)._transform).toBe(true);
  });

  test('toDate returns a Date', () => {
    expect(U.toDate()('2024-01-01')).toBeInstanceOf(Date);
  });

  test('rawTransform wraps an arbitrary function', () => {
    expect(U.rawTransform((v: number) => v * 2)(3)).toBe(6);
  });

  test('item transforms', () => {
    expect(U.mapItems((x: number) => x * 2)([1, 2])).toEqual([2, 4]);
    expect(U.filterItems((x: number) => x > 1)([1, 2, 3])).toEqual([2, 3]);
    expect(U.sortItems()([3, 1, 2])).toEqual([1, 2, 3]);
    expect(U.reduceItems((a: number, b: number) => a + b, 0)([1, 2, 3])).toBe(6);
    expect(U.findItem((x: number) => x > 1)([1, 2, 3])).toBe(2);
  });

  test('item checks', () => {
    accepts(U.everyItem((x: number) => x > 0), [1, 2]);
    rejects(U.everyItem((x: number) => x > 0), [1, -1]);
    accepts(U.someItem((x: number) => x > 1), [1, 2]);
    rejects(U.someItem((x: number) => x > 5), [1, 2]);
    accepts(U.checkItems(number()), [1, 2]);
    rejects(U.checkItems(number()), [1, 'x']);
  });
});

describe('checks, guards and composition', () => {
  test('check / rawCheck / guard / partialCheck', () => {
    accepts(U.check((v: number) => v > 2), 3);
    rejects(U.check((v: number) => v > 2, 'too small'), 1, 'too small');
    accepts(U.rawCheck((v: number) => v > 0 || 'must be positive'), 1);
    rejects(U.rawCheck((v: number) => v > 0 || 'must be positive'), -1, 'must be positive');
    expect(U.guard(string())('x')).toBe(true);
    expect(U.guard(string())(1)).toBe(false);
    accepts(U.partialCheck({ a: string() }, (v: any) => v.a.length > 2), { a: 'abc', b: 1 });
    rejects(U.partialCheck({ a: string() }, () => true), { a: 1 });
  });

  test('checks work inside core validations and standalone', () => {
    const Schema = string('bad string', [U.email('Invalid email'), U.minLength(15, 'Too short')]);
    expect(safeParse(Schema, 'a@b.com').success).toBe(false);
    const r = safeParse(Schema, 'a@b.com');
    if (!r.success) expect(r.error.message).toBe('Too short');
    expect(safeParse(U.email(), 'x').success).toBe(false);
    expect(safeParse(U.ipv4(), '1.2.3.4').success).toBe(true);
    expect(safeParse(string('', [U.email()]), 'a@b.com').success).toBe(true);
  });

  test('pipe() composes transforms and checks, returning transformed data at root', () => {
    const Email = U.pipe(string(), U.trim(), U.email());
    expect(parse(Email, '  ada@example.com  ')).toBe('ada@example.com');
    const r = safeParse(Email, '  nope  ');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/Invalid email/);

    const TooShort = U.pipe(string(), U.trim(), U.minLength(20));
    expect(safeParse(TooShort, '  hi  ').success).toBe(false);
  });

  test('pipe() still validates when nested in an object (validation-only)', () => {
    const Schema = object({ email: U.pipe(string(), U.trim(), U.email()) });
    expect(safeParse(Schema, { email: '  a@b.com  ' }).success).toBe(true);
  });

  test('core transform accepts a utils transform action', () => {
    expect(parse(U.transform(string(), U.trim()), '  x  ')).toBe('x');
  });

  test('args / returns / readonly / metadata decorators', () => {
    expect(safeParse(U.args(string(), number()), ['a', 1]).success).toBe(true);
    expect(safeParse(U.args(string(), number()), ['a', 'b']).success).toBe(false);
    expect(U.returns(number())(() => 5)()).toBe(5);
    expect(() => U.returns(number())(() => 'x')()).toThrow(VError);
    expect(safeParse(U.readonly(string()), 'x').success).toBe(true);
    const named = U.title(string(), 'Name');
    expect((named as any).title).toBe('Name');
    expect(U.description(string(), 'desc')).toBeDefined();
    expect(U.metadata(string(), { a: 1 })).toBeDefined();
    expect(U.examples(string(), ['a'])).toBeDefined();
    expect(U.brand(string(), 'UserId')).toBeDefined();
    expect(U.flavor(string(), 'Email')).toBeDefined();
  });

  test('metadata can also be applied as a pipe action', () => {
    const Schema = U.pipe(string(), U.title('Username'));
    expect((Schema as any).title).toBeUndefined(); // decorated schema is internal
    expect(parse(Schema, 'ada')).toBe('ada');
  });
});
