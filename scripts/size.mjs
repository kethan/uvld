// Enforced byte budget. Fails CI if a change makes the library bigger.
// Baseline (0.0.1, unminified ESM): 6422 raw / 1678 gzip / 1504 brotli.
// The core budget is deliberately tight: importing `uvld/utils` must never
// add a single byte to the core bundle.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const BUDGET = {
  // The single `uvld` entry: core + utilities (1.2.0). Every export is a lazy
  // factory, so tree-shaken ESM consumers still pay only for what they import
  // (~520 B gzip for `is(string(), 1)`); these budgets cover the whole file,
  // which CJS and IIFE consumers load in full.
  'dist/index.js': { raw: 19100, gzip: 6760, brotli: 6130 },
  'dist/index.cjs': { raw: 18950, gzip: 6130, brotli: 5560 },
  'dist/index.min.js': { raw: 17820, gzip: 6070, brotli: 5510 },
  // legacy `uvld/utils` subpath — a re-export shim, not a second copy
  'dist/utils.js': { raw: 300, gzip: 200, brotli: 180 },
  'dist/utils.cjs': { raw: 600, gzip: 350, brotli: 300 },
  // optional async entry point
  'dist/async.js': { raw: 6200, gzip: 2100, brotli: 1900 },
  'dist/async.cjs': { raw: 6250, gzip: 2050, brotli: 1850 }
};

let failed = false;
console.log('file'.padEnd(22), 'raw'.padStart(7), 'gzip'.padStart(7), 'brotli'.padStart(8), '  budget (raw/gzip/br)');
for (const [file, limit] of Object.entries(BUDGET)) {
  if (!existsSync(file)) {
    console.error(`MISSING ${file} — run \`npm run build\` first.`);
    failed = true;
    continue;
  }
  const buf = readFileSync(file);
  const sizes = { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length, brotli: brotliCompressSync(buf).length };
  const over = Object.keys(limit).filter(k => sizes[k] > limit[k]);
  console.log(
    file.padEnd(22),
    String(sizes.raw).padStart(7),
    String(sizes.gzip).padStart(7),
    String(sizes.brotli).padStart(8),
    `  ${limit.raw}/${limit.gzip}/${limit.brotli}`,
    over.length ? `OVER: ${over.join(', ')}` : 'OK'
  );
  if (over.length) failed = true;
}
console.log('\nbaseline 0.0.1 ESM (unminified): raw 6422 / gzip 1678 / brotli 1504');
console.log('runtime dependencies:', JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? 0);
console.log('uvld/utils is a re-export shim, not a second copy:',
  readFileSync('dist/utils.js', 'utf8').includes('from"./index.js"') &&
  readFileSync('dist/utils.js').length < 300 ? 'yes' : 'check build');
if (failed) process.exit(1);
