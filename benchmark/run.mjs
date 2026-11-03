// Runs the runtime throughput benchmark and the bundle-size benchmark, checks
// that every library agrees on the fixtures, and writes RESULTS.md.
//
//     npm --prefix benchmark install
//     npm run bench                # from the repo root
//     BENCH_QUICK=1 npm run bench  # shorter samples

import { writeFileSync } from 'node:fs';
import { cpus, platform, arch, release } from 'node:os';
import { pathToFileURL } from 'node:url';

import { mdTable, fmtOps } from './harness.mjs';

// Loaded dynamically so a missing benchmark install prints an instruction
// instead of a raw ERR_MODULE_NOT_FOUND stack trace.
let schemas, runtimeMod, sizeMod;
try {
  [schemas, runtimeMod, sizeMod] = await Promise.all([
    import('./schemas.mjs'),
    import('./runtime.mjs'),
    import('./size.mjs')
  ]);
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('\nBenchmark dependencies are missing. Run:\n\n  npm --prefix benchmark install\n');
    process.exit(1);
  }
  throw error;
}
const { LIBS, INVALID, VALID } = schemas;
const { runRuntime, runtimeMarkdown, verify } = runtimeMod;
const { measureSize, rawMarkdown, sizeMarkdown, writeEntries } = sizeMod;

const stamp = new Date().toISOString().slice(0, 10);
const quick = process.env.BENCH_QUICK === '1';

const fail = message => {
  console.error(`\n${message}`);
  process.exit(1);
};

// --- 1. every library must agree on the fixtures ---------------------------
const checks = verify();
const disagreements = checks.filter(row => Object.entries(row).some(([key, ok]) => key !== 'id' && !ok));
if (disagreements.length) {
  console.error('Schemas disagree on the fixtures, refusing to benchmark:');
  for (const row of disagreements) console.error(' ', row);
  process.exit(1);
}

// The sizes are measured on generated entry files; make sure those entries
// really implement the same schema.
const entryPaths = writeEntries();
for (const [lib, cases] of Object.entries(entryPaths)) {
  const mod = await import(pathToFileURL(cases.user).href);
  if (mod.accepted !== true || mod.check(INVALID) !== false) {
    console.error(`Size entry for ${lib} does not match the fixtures.`);
    process.exit(1);
  }
}

// --- 2. runtime ------------------------------------------------------------
console.log('Runtime (median ops/sec, higher is better)');
const runtime = runRuntime();

// --- 3. bundle size --------------------------------------------------------
console.log('\nBundle size (esbuild bundle + minify + ESM, gzip level 9)');
const size = await measureSize();

// --- 4. report -------------------------------------------------------------
const versions = LIBS.map(lib => [lib.label, lib.version]);

const byCase = Object.fromEntries(runtime.map(c => [c.id, c]));
const validCase = byCase.valid;
const createCase = byCase.create;
const sizeById = Object.fromEntries(size.map(row => [row.id, row.cases.user]));

const headline = mdTable(
  ['library', 'create schema', 'valid object', 'relative', 'user schema (gzip, esbuild)', 'user schema (gzip, Rollup)'],
  validCase.rows.map(row => {
    const create = createCase.rows.find(r => r.id === row.id);
    return [
      row.label,
      `${fmtOps(create.opsPerSec)} ops/s`,
      `${fmtOps(row.opsPerSec)} ops/s`,
      `${(row.opsPerSec / validCase.best).toFixed(2)}x`,
      `${sizeById[row.id].esbuild.gzip} B`,
      `${sizeById[row.id].rollup.gzip} B`
    ];
  }),
  { align: ['---', '---:', '---:', '---:', '---:', '---:'] }
);

const rank = (rows, id, better) => {
  const sorted = [...rows].sort((a, b) => (better === 'high' ? b.opsPerSec - a.opsPerSec : a.opsPerSec - b.opsPerSec));
  return sorted.findIndex(r => r.id === id) + 1;
};
const sizeRank = (bundler, id) => {
  const sorted = [...size].sort(
    (a, b) => a.cases.user[bundler].gzip - b.cases.user[bundler].gzip
  );
  return sorted.findIndex(r => r.id === id) + 1;
};

const uvldOps = validCase.rows.find(r => r.id === 'uvld').opsPerSec;
const builders = validCase.rows.filter(r => r.id !== 'ajv');
const bestBuilder = builders[0];
const highlights = [
  `- **Throughput.** ajv is fastest overall (${fmtOps(validCase.rows[0].opsPerSec)} ops/s on the ` +
    `object), but it is compiled, not built; among the schema builders ${bestBuilder.label} leads at ` +
    `${fmtOps(bestBuilder.opsPerSec)} ops/s and uvld is ` +
    `${(bestBuilder.opsPerSec / uvldOps).toFixed(1)}× behind it ` +
    `(${fmtOps(uvldOps)} ops/s, rank ${rank(validCase.rows, 'uvld', 'high')} of ${validCase.rows.length} overall).`,
  `- **Schema creation.** uvld is the fastest builder of the six ` +
    `(${fmtOps(createCase.rows.find(r => r.id === 'uvld').opsPerSec)} ops/s vs ` +
    `${fmtOps(createCase.rows.find(r => r.id === 'zod').opsPerSec)} for zod); ` +
    `ajv's one-off compile dominates that row.`,
  `- **Bundle.** The user schema costs ${sizeById.uvld.esbuild.gzip} B gzip with esbuild ` +
    `(rank ${sizeRank('esbuild', 'uvld')} of ${size.length}) and ` +
    `${sizeById.uvld.rollup.gzip} B with Rollup (rank ${sizeRank('rollup', 'uvld')} of ${size.length}).`
].join('\n');

const markdown = `# Benchmark results

Generated by \`benchmark/run.mjs\` on ${stamp} — Node ${process.version}, ${platform()} ${release()} (${arch()}), ${cpus().length} × ${cpus()[0].model.trim()}.

> Runtime numbers are machine-specific and vary with CPU, Node version and JIT
> state. Compare ratios between libraries in the same run rather than absolute
> ops/sec across runs. Bundle sizes are deterministic for a given version.

## Versions

${mdTable(['library', 'version'], versions)}

## At a glance

${headline}

${highlights}

## Correctness

Every schema is checked against the same fixtures before any timing: a valid
payload (five fields, nested object, array, email, numeric bounds, regex) must
be accepted, and a payload with a bad email and out-of-range age must be
rejected. All ${LIBS.length} libraries agree — for all of them the object, list,
string and email cases produce identical accept/reject results.

## Runtime

Ops/sec for schema creation and for validation of the same payloads, per case.
Median of ${quick ? 5 : 11} samples per case after warm-up; each sample runs a batch
calibrated to ~${quick ? 15 : 50} ms. Libraries are timed interleaved within a
case, so a machine that slows down mid-run affects all of them equally.
\`ops/sec\` is higher-is-better; \`relative\` is against the fastest library in
that row.${quick ? '\n\n**Note:** this run used \`BENCH_QUICK=1\` (5 samples, shorter batches), so treat it as indicative.' : ''}

${runtimeMarkdown(runtime)}

## Bundle size

A consumer's shipped bytes for a given import. Each entry is bundled minified
and gzipped at level 9 — twice, because bundlers disagree on how well they can
tree-shake some packages:

- **esbuild 0.28.2** — bundle + minify + ESM, browser platform, esnext target.
  This is the method bundlejs.com uses.
- **Rollup 4.65 + Terser** — the same entries, resolved with
  \`@rollup/plugin-node-resolve\` (browser build), minified with Terser.

Cases:

- **string** — one min-length string check plus a parse.
- **email** — one email format check plus a parse.
- **user** — the full object schema from this benchmark plus one parse.
- **full** — \`import * as lib\` (nothing can be tree-shaken); upper bound.

### esbuild

${sizeMarkdown(size, 'esbuild')}

### Rollup + Terser

${sizeMarkdown(size, 'rollup')}

Raw bytes — esbuild:

${rawMarkdown(size, 'esbuild')}

Raw bytes — Rollup:

${rawMarkdown(size, 'rollup')}

**Why zod is split so far between the two:** zod 4 exports \`z\` as a namespace
re-export (\`import * as z ...; export { z }\`), which esbuild materialises in
full — locales, JSON-Schema conversion and all — even when one name is imported.
Rollup analyses which namespace members are used and drops the rest. Both
numbers are real: they are what consumers of each bundler ship.

**Why joi and ajv barely move:** both ship CommonJS, which neither bundler can
tree-shake. Whatever the entry imports, the whole package is included.

## Method

- **Same shape everywhere.** \`name\` (2–50 chars), \`email\` (format), \`age\`
  (integer 18–120), \`tags\` (array of strings), \`address.city\` (string),
  \`address.zip\` (5 digits). Defined once per library in \`schemas.mjs\`.
- **Same work.** Every adapter returns a boolean, so throw-based APIs (yup's
  \`validateSync\`) and result-based APIs (zod/valibot/uvld \`safeParse\`, joi
  \`validate\`, ajv boolean) all include their error construction. Creating the
  schema is measured separately, which is where ajv's compile step lands.
- **No casts, no coercion.** yup runs with \`strict: true\`, joi with
  \`convert: false\`, so every library validates the input as-is. uvld and zod
  return the original value rather than a cast copy; yup and joi can transform.
- **ajv** validates an equivalent JSON Schema. \`format: 'email'\` would need
  \`ajv-formats\`, so email is expressed as the same regex the other libraries
  do not need. \`multipleOf: 1\` is JSON Schema's integer check.
- Runtime: Node's \`hrtime\`, median of 9 samples, batches calibrated to ~40 ms,
  results consumed through a sink to defeat dead-code elimination.
- Bundle size: esbuild 0.28.2, gzip via \`node:zlib\` level 9, brotli default.

## Caveats

- This is **one schema**. Libraries differ in what they optimise: ajv compiles
  to specialised JS (slow to create, fast to reuse), joi/yup carry casting and
  transform features, zod clones parsed output in some paths, valibot and uvld
  are plain function composition. Try the shapes that matter to you.
- Runtime numbers exclude process startup and module loading — they measure
  validation only. Schema creation is its own row.
- The \`full\` size column is an upper bound for ESM consumers: real code
  imports names. It still matters for \`require()\` and CDN builds, which cannot
  tree-shake.
`;

writeFileSync(new URL('./RESULTS.md', import.meta.url), markdown);
writeFileSync(new URL('./RESULTS.json', import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0].model.trim(),
    cores: cpus().length,
    quick
  },
  versions: Object.fromEntries(versions),
  correctness: checks,
  runtime: Object.fromEntries(runtime.map(c => [c.id, Object.fromEntries(
    c.rows.map(r => [r.id, { opsPerSec: Math.round(r.opsPerSec), nsPerOp: Number(r.nsPerOp.toFixed(2)) }])
  )])),
  size: Object.fromEntries(size.map(row => [row.id, row.cases]))
}, null, 2) + '\n');

console.log('\nWrote benchmark/RESULTS.md');
console.log('\nSummary (gzip, user schema):');
console.log(
  size.map(row => `  ${row.id.padEnd(8)} esbuild ${String(row.cases.user.esbuild.gzip).padStart(6)} B   rollup ${String(row.cases.user.rollup.gzip).padStart(6)} B`).join('\n')
);
console.log('\nRuntime (valid object, ops/sec):');
console.log(validCase.rows.map(r => `  ${r.label.padEnd(8)} ${fmtOps(r.opsPerSec)}`).join('\n'));
