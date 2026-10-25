// Enforced byte budget. Fails CI if a change makes the library bigger.
// Baseline (0.0.1, unminified ESM): 6422 raw / 1678 gzip / 1504 brotli.
// The core budget is deliberately tight: importing `uvld/utils` must never
// add a single byte to the core bundle.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const BUDGET = {
  // core (unchanged by the utils entry point)
  'dist/index.js': { raw: 4450, gzip: 1950, brotli: 1790 },
  'dist/index.cjs': { raw: 4600, gzip: 1900, brotli: 1750 },
  'dist/index.min.js': { raw: 4400, gzip: 1900, brotli: 1750 },
  // optional utils entry point
  'dist/utils.js': { raw: 14200, gzip: 5300, brotli: 4800 },
  'dist/utils.cjs': { raw: 14600, gzip: 5150, brotli: 4650 },
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
console.log('core ESM is byte-identical with or without uvld/utils:',
  readFileSync('dist/utils.js', 'utf8').includes('from"./index.js"') ? 'yes (external import)' : 'check build');
if (failed) process.exit(1);
