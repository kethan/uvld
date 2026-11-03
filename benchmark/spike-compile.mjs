// Spike: what does a closure-tree compile() buy end-to-end?
//
//     npm run build && node benchmark/spike-compile.mjs
//
// The same schema as the main benchmark, measured three ways: uvld's generic
// validator, uvld compiled to a boolean predicate (src/compile.js), and the
// reference libraries. Timed interleaved with the main harness so machine
// drift is shared by every candidate.
//
// SPIKE: not part of run.mjs, not part of the published numbers.

import { benchAll, columns, fmtOps } from './harness.mjs';
import { INVALID, LIST, VALID } from './schemas.mjs';
import * as uvld from '../dist/index.js';
import { compile, compileSafeParse } from '../src/compile.js';
import { z } from 'zod';
import * as v from 'valibot';
import Ajv from 'ajv';

const ZIP = /^\d{5}$/;

// --- the same schema, once per library --------------------------------------
const uvldUser = () => uvld.object({
  name: uvld.string('', [uvld.minLength(2), uvld.maxLength(50)]),
  email: uvld.string('', [uvld.email()]),
  age: uvld.number('', [uvld.integerCheck(), uvld.min(18), uvld.max(120)]),
  tags: uvld.array(uvld.string()),
  address: uvld.object({ city: uvld.string(), zip: uvld.string('', [uvld.regex(ZIP)]) })
});

const user = uvldUser();
const userList = uvld.array(user);
const compiled = compile(user);
const compiledList = compile(userList);
const compiledSafeParse = compileSafeParse(user, uvld.safeParse);

const zod = z.object({
  name: z.string().min(2).max(50),
  email: z.email(),
  age: z.number().int().min(18).max(120),
  tags: z.array(z.string()),
  address: z.object({ city: z.string(), zip: z.string().regex(ZIP) })
});
const zodList = z.array(zod);

const valibot = v.object({
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(50)),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(120)),
  tags: v.array(v.string()),
  address: v.object({ city: v.string(), zip: v.pipe(v.string(), v.regex(ZIP)) })
});
const valibotList = v.array(valibot);

const ajv = new Ajv({ allErrors: true, strict: false });
const ajvSchema = {
  type: 'object',
  required: ['name', 'email', 'age', 'tags', 'address'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 50 },
    email: { type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
    age: { type: 'number', minimum: 18, maximum: 120, multipleOf: 1 },
    tags: { type: 'array', items: { type: 'string' } },
    address: { type: 'object', required: ['city', 'zip'], properties: { city: { type: 'string' }, zip: { type: 'string', pattern: '^\\d{5}$' } } }
  }
};
const ajvValidate = ajv.compile(ajvSchema);
const ajvValidateList = ajv.compile({ type: 'array', items: ajvSchema });

// --- correctness gate -------------------------------------------------------
const edge = [
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
const mismatches = edge.filter(value => compiled(value) !== uvld.is(user, value));
if (mismatches.length) {
  for (const value of mismatches) {
    console.error('MISMATCH', JSON.stringify(value), 'generic', uvld.is(user, value), 'compiled', compiled(value));
  }
  process.exit(1);
}
if (!compiledList(LIST) || compiledList([...LIST, INVALID])) {
  console.error('compiled array schema disagrees on LIST');
  process.exit(1);
}
// Mixed schemas exercise the fallback: optional/nullable wrappers, strict,
// combinators and refinements attached to a composite all go through the
// generic validator, so they must still agree.
const mixedSchemas = [
  ['optional field', uvld.object({ a: uvld.string(), b: uvld.optional(uvld.number()) })],
  ['nullable field', uvld.object({ a: uvld.nullable(uvld.string()) })],
  ['strict object', uvld.strict({ a: uvld.string() })],
  ['or()', uvld.object({ a: uvld.or(uvld.string(), uvld.number()) })],
  ['refined object', uvld.object({ a: uvld.string() }, '', [uvld.custom(o => typeof o.a === 'string' && o.a.length > 2)])],
  ['nested array of objects', uvld.array(uvld.object({ a: uvld.string() }))]
];
const mixedValues = [
  { a: 'x' }, { a: 'x', b: 1 }, { a: 'x', b: 'no' }, { a: null }, { a: 1 }, { a: 'ab' },
  {}, { a: 'x', extra: 1 }, [{ a: 'x' }], [{ a: 1 }], [], [{}]
];
let mixed = 0;
for (const [label, schema] of mixedSchemas) {
  const fast = compile(schema);
  for (const value of mixedValues) {
    if (fast(value) !== uvld.is(schema, value)) {
      mixed++;
      console.error('MISMATCH', label, JSON.stringify(value), 'generic', uvld.is(schema, value), 'compiled', fast(value));
    }
  }
}
if (mixed) process.exit(1);

console.log(`correctness: compiled agrees with the generic validator on ${edge.length} values and ${mixedSchemas.length} mixed schemas\n`);

// --- timing -----------------------------------------------------------------
const quick = process.env.BENCH_QUICK === '1';
const options = quick ? { minSampleMs: 15, samples: 5 } : { minSampleMs: 50, samples: 11 };

const userCases = value => [
  ['uvld generic safeParse', () => uvld.safeParse(user, value).success],
  ['uvld compiled', () => compiled(value)],
  ['uvld compiled + safeParse', () => compiledSafeParse(value).success],
  ['zod safeParse', () => zod.safeParse(value).success],
  ['valibot safeParse', () => v.safeParse(valibot, value).success],
  ['ajv', () => ajvValidate(value)]
];

const listCases = [
  ['uvld generic safeParse', () => uvld.safeParse(userList, LIST).success],
  ['uvld compiled', () => compiledList(LIST)],
  ['zod safeParse', () => zodList.safeParse(LIST).success],
  ['valibot safeParse', () => v.safeParse(valibotList, LIST).success],
  ['ajv', () => ajvValidateList(LIST)]
];

const show = (label, cases) => {
  const timings = benchAll(cases.map(([, fn]) => fn), options);
  const best = Math.max(...timings.map(t => t.opsPerSec));
  const rows = timings.map((t, i) => [
    cases[i][0], fmtOps(t.opsPerSec), t.nsPerOp.toFixed(0), `${(t.opsPerSec / best).toFixed(2)}x`
  ]);
  console.log(label);
  console.log(columns(['library', 'ops/sec', 'ns/op', 'relative'], rows, { align: ['left', 'right', 'right', 'right'] }));
  console.log();
};

show('validate a valid object', userCases(VALID));
show('reject an invalid object', userCases(INVALID));
show('validate 100 objects', listCases);

const schemas = Array.from({ length: 200 }, () => uvldUser());
const t0 = process.hrtime.bigint();
for (const s of schemas) compile(s);
console.log(`compile(): ${(Number(process.hrtime.bigint() - t0) / schemas.length / 1000).toFixed(1)} us per schema`);
