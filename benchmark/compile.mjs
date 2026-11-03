// What does compiling a schema into a predicate buy?
//
//     npm run build && node benchmark/compile.mjs
//
// `uvld/compile` walks a schema once and returns a closure tree instead of an
// interpreter. This measures that predicate against the generic validator and
// the same schema expressed in the reference libraries, using the main
// benchmark's fixtures and schema builders so every candidate validates the
// same shape. Timings are interleaved inside one case, like `runtime.mjs`.

import { benchAll, columns, fmtOps, mdTable } from './harness.mjs';
import { INVALID, LIST, VALID, uvldUser, zodUser, valibotUser, ajvUserSchema } from './schemas.mjs';
import * as uvld from '../dist/index.js';
import { compile, compileParse } from '../dist/compile.js';
import { z } from 'zod';
import * as v from 'valibot';
import Ajv from 'ajv';

const user = uvldUser();
const userList = uvld.array(uvldUser());
const compiled = compile(user);
const compiledList = compile(userList);
const compiledParse = compileParse(user);

const zod = zodUser();
const zodList = z.array(zodUser());
const valibot = valibotUser();
const valibotList = v.array(valibotUser());

const ajv = new Ajv({ allErrors: true, strict: false });
const ajvUser = ajv.compile(ajvUserSchema());
const ajvList = ajv.compile({ type: 'array', items: ajvUserSchema() });

// --- correctness gate -------------------------------------------------------
// A compiled predicate is only useful if it agrees with the interpreter, so
// every fixture the main harness uses — plus the edge cases that separate the
// fast path from the fallbacks — is checked before anything is timed.
const EDGE = [
  VALID, INVALID, LIST[0], {}, null, undefined, 'string', [],
  { ...VALID, name: 'A' },
  { ...VALID, name: 'x'.repeat(51) },
  { ...VALID, email: 'ada@example' },
  { ...VALID, age: 17 },
  { ...VALID, age: 121 },
  { ...VALID, age: 36.5 },
  { ...VALID, age: '36' },
  { ...VALID, tags: ['ok', 1] },
  { ...VALID, tags: 'nope' },
  { ...VALID, address: { city: 'London', zip: '1234' } },
  { ...VALID, address: null },
  { ...VALID, extra: true }
];

const MIXED = [
  ['optional field', uvld.object({ a: uvld.string(), b: uvld.optional(uvld.number()) })],
  ['nullable field', uvld.object({ a: uvld.nullable(uvld.string()) })],
  ['strict object', uvld.strict({ a: uvld.string() })],
  ['or()', uvld.object({ a: uvld.or(uvld.string(), uvld.number()) })],
  ['refined object', uvld.object({ a: uvld.string() }, '', [uvld.custom(o => typeof o.a === 'string' && o.a.length > 2)])],
  ['nested array of objects', uvld.array(uvld.object({ a: uvld.string() }))]
];
const MIXED_VALUES = [
  { a: 'x' }, { a: 'x', b: 1 }, { a: 'x', b: 'no' }, { a: null }, { a: 1 }, { a: 'ab' },
  {}, { a: 'x', extra: 1 }, [{ a: 'x' }], [{ a: 1 }], [], [{}]
];

export function verifyCompile() {
  for (const value of EDGE) {
    const generic = uvld.is(user, value);
    if (compiled(value) !== generic) {
      throw new Error(`compiled() disagrees with is() on ${JSON.stringify(value)}: ${compiled(value)} vs ${generic}`);
    }
    const want = uvld.safeParse(user, value);
    const got = compiledParse(value);
    if (got.success !== want.success) {
      throw new Error(`compileParse() disagrees with safeParse() on ${JSON.stringify(value)}`);
    }
  }
  if (!compiledList(LIST) || compiledList([...LIST, INVALID])) {
    throw new Error('compiled array schema disagrees on LIST');
  }
  for (const [label, schema] of MIXED) {
    const fast = compile(schema);
    for (const value of MIXED_VALUES) {
      if (fast(value) !== uvld.is(schema, value)) {
        throw new Error(`compiled() disagrees on "${label}" for ${JSON.stringify(value)}`);
      }
    }
  }
  return { values: EDGE.length, schemas: MIXED.length };
}

// --- timing -----------------------------------------------------------------
const userCases = value => [
  ['uvld generic safeParse', () => uvld.safeParse(user, value).success],
  ['uvld compiled', () => compiled(value)],
  ['uvld compiled + safeParse', () => compiledParse(value).success],
  ['zod safeParse', () => zod.safeParse(value).success],
  ['valibot safeParse', () => v.safeParse(valibot, value).success],
  ['ajv', () => ajvUser(value)]
];

const listCases = [
  ['uvld generic safeParse', () => uvld.safeParse(userList, LIST).success],
  ['uvld compiled', () => compiledList(LIST)],
  ['zod safeParse', () => zodList.safeParse(LIST).success],
  ['valibot safeParse', () => v.safeParse(valibotList, LIST).success],
  ['ajv', () => ajvList(LIST)]
];

export const COMPILE_CASES = [
  { id: 'compile-valid', label: 'Valid object, compiled predicate', make: () => userCases(VALID) },
  { id: 'compile-invalid', label: 'Invalid object, compiled predicate', make: () => userCases(INVALID) },
  { id: 'compile-list', label: '100 objects, compiled predicate', make: () => listCases }
];

export function runCompile({ quiet = false } = {}) {
  verifyCompile();
  const quick = process.env.BENCH_QUICK === '1';
  const options = quick ? { minSampleMs: 15, samples: 5 } : { minSampleMs: 50, samples: 11 };
  const cases = [];
  for (const testCase of COMPILE_CASES) {
    const candidates = testCase.make();
    const timings = benchAll(candidates.map(([, fn]) => fn), options);
    const best = Math.max(...timings.map(t => t.opsPerSec));
    const rows = timings.map((t, i) => ({
      id: candidates[i][0],
      label: candidates[i][0],
      opsPerSec: t.opsPerSec,
      nsPerOp: t.nsPerOp,
      iterations: t.iterations
    }));
    cases.push({ id: testCase.id, label: testCase.label, rows, best });
    if (!quiet) {
      console.log(`\n${testCase.label}`);
      console.log(columns(
        ['library', 'ops/sec', 'ns/op', 'relative'],
        rows.map(r => [r.label, fmtOps(r.opsPerSec), r.nsPerOp.toFixed(0), `${(r.opsPerSec / best).toFixed(2)}x`]),
        { align: ['left', 'right', 'right', 'right'] }
      ));
    }
  }

  // Compiling is a one-off cost; report it next to validation.
  const schemas = Array.from({ length: 200 }, () => uvldUser());
  const start = process.hrtime.bigint();
  for (const schema of schemas) compile(schema);
  const compileNs = Number(process.hrtime.bigint() - start) / schemas.length;
  if (!quiet) console.log(`\ncompile(): ${(compileNs / 1000).toFixed(1)} µs per schema (vs ~0.6 µs to build it)`);
  return { cases, compileNs };
}

export function compileMarkdown(result) {
  const sections = result.cases.map(({ label, rows, best }) => `### ${label}\n\n${mdTable(
    ['library', 'ops/sec', 'ns/op', 'relative'],
    rows.map(r => [r.label, fmtOps(r.opsPerSec), r.nsPerOp.toFixed(0), `${(r.opsPerSec / best).toFixed(2)}x`]),
    { align: ['---', '---:', '---:', '---:'] }
  )}`);
  return sections.join('\n\n');
}

// Standalone: `node benchmark/compile.mjs`
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const result = runCompile();
  const ns = id => result.cases.find(c => c.id === id).rows;
  const pick = (rows, id) => rows.find(r => r.id === id).nsPerOp.toFixed(0);
  const valid = ns('compile-valid');
  console.log(
    `\nvalid object: generic ${pick(valid, 'uvld generic safeParse')} ns → ` +
    `compiled ${pick(valid, 'uvld compiled')} ns ` +
    `(${(pick(valid, 'uvld generic safeParse') / pick(valid, 'uvld compiled')).toFixed(1)}×)`
  );
}
