import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p: string) => readFileSync(at(p), 'utf8');

const runtimeExports = (): string[] => {
  const block = read('src/index.js').match(/export\s*\{([\s\S]*?)\};/);
  expect(block).not.toBeNull();
  return block![1].split(',').map(s => s.trim()).filter(Boolean).sort();
};

const declaredValues = (): string[] => {
  const dts = read('src/index.d.ts');
  return [...dts.matchAll(/^export (?:const|function|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]).sort();
};

const declaredTypes = (): string[] => {
  const dts = read('src/index.d.ts');
  return [...dts.matchAll(/^export (?:type|interface)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]).sort();
};

const utilsExports = (): string[] => {
  const block = read('src/utils.js').match(/export\s*\{([\s\S]*?)\};/);
  expect(block).not.toBeNull();
  return block![1].split(',').map(s => s.trim()).filter(Boolean).sort();
};

const declaredUtils = (): string[] => {
  const dts = read('src/utils.d.ts');
  return [...dts.matchAll(/^export const\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]).sort();
};

// All 128 names from the utils feature list.
const UTILS_NAMES = (`args base64 bic brand bytes check checkItems codePoints creditCard cuid2 decimal
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

describe('API surface stays in sync', () => {
  test('every runtime export is declared in index.d.ts and vice versa', () => {
    const runtime = runtimeExports();
    expect(runtime).toHaveLength(38);
    expect(declaredValues()).toEqual(runtime);
  });

  test('type-only exports exist and do not leak into runtime exports', () => {
    const types = declaredTypes();
    for (const t of ['Issue', 'Validator', 'Infer', 'Context', 'Origin', 'SafeParseReturn', 'Refinement', 'ValidationResult', 'UnionToIntersection', 'InferShape', 'ValidatorFactory', 'RefinementResult']) {
      expect(types).toContain(t);
    }
    for (const t of types) expect(runtimeExports()).not.toContain(t);
  });

  test('README documents every core and utils export', () => {
    const readme = read('README.md');
    const missing = [...runtimeExports(), ...UTILS_NAMES]
      .filter(name => !new RegExp(`\\b${name}\\b`).test(readme));
    expect(missing).toEqual([]);
    expect(readme).toMatch(/## Quickstart/i);
    expect(readme).toMatch(/## Use cases/i);
    expect(readme).toMatch(/uvld\/utils/);
  });

  test('utils entry point: runtime exports match declarations and the feature list', () => {
    const runtime = utilsExports();
    expect(runtime).toHaveLength(129); // 128 requested + pipe
    expect(UTILS_NAMES).toHaveLength(128);
    expect(UTILS_NAMES.filter(n => !runtime.includes(n))).toEqual([]);
    expect(declaredUtils()).toEqual(runtime);
    expect(runtime).toContain('pipe');
  });

  test('utils does not import a bundled copy of the core', () => {
    expect(read('src/utils.js')).toContain("from './index.js'");
  });

  test('the abandoned prototype is gone (one source of truth)', () => {
    expect(existsSync(at('src/try.ts'))).toBe(false);
  });
});

describe('package manifest', () => {
  const pkg = () => JSON.parse(read('package.json'));

  test('types resolve to a real file and exports puts types first', () => {
    const p = pkg();
    expect(p.types).toBe('./dist/index.d.ts');
    expect(Object.keys(p.exports['.'])[0]).toBe('types');
    expect(p.exports['.'].types).toBe('./dist/index.d.ts');
    expect(existsSync(at('src/index.d.ts'))).toBe(true);
  });

  test('require is reachable before default and points at a .cjs file', () => {
    const conditions = Object.keys(pkg().exports['.']);
    expect(conditions.indexOf('require')).toBeLessThan(conditions.indexOf('default'));
    expect(pkg().main).toMatch(/\.cjs$/);
    expect(pkg().exports['.'].require).toMatch(/\.cjs$/);
    expect(pkg().module).toMatch(/\/index\.js$/);
    expect(pkg().type).toBe('module');
  });

  test('the ./utils subpath is fully declared', () => {
    const p = pkg();
    const sub = p.exports['./utils'];
    expect(Object.keys(sub)[0]).toBe('types');
    expect(sub.types).toBe('./dist/utils.d.ts');
    expect(sub.import).toBe('./dist/utils.js');
    expect(sub.require).toMatch(/\.cjs$/);
    expect(Object.keys(sub).indexOf('require')).toBeLessThan(Object.keys(sub).indexOf('default'));
    expect(p.files).toContain('utils.d.ts');
    expect(read('utils.d.ts')).toContain('./dist/utils.js');
  });

  test('zero runtime dependencies, correct license, useful metadata', () => {
    const p = pkg();
    expect(p.dependencies ?? {}).toEqual({});
    expect(p.license).toBe('ISC');
    expect(read('LICENSE')).toContain('ISC');
    expect(p.sideEffects).toBe(false);
    expect(p.files).toContain('dist');
    expect(p.engines.node).toBeTruthy();
    expect(p.version).toBe('1.0.0');
    expect(p.keywords.length).toBeGreaterThan(3);
  });

  test('scripts cover typecheck, tests, examples, build, size and smoke', () => {
    const s = pkg().scripts;
    for (const key of ['test', 'test:watch', 'typecheck', 'examples', 'build', 'size', 'smoke', 'check', 'prepack']) {
      expect(s[key]).toBeTruthy();
    }
    expect(s.test).toContain('vitest run'); // no watch-mode hang in CI
  });
});
