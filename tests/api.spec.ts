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

  test('README documents every runtime export', () => {
    const readme = read('README.md');
    const missing = runtimeExports().filter(name => !new RegExp(`\\b${name}\\b`).test(readme));
    expect(missing).toEqual([]);
    expect(readme).toMatch(/## Quickstart/i);
    expect(readme).toMatch(/## Use cases/i);
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
