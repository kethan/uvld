// Enforced byte budget. Fails CI if a change makes the library bigger.
// Baseline (0.0.1, unminified ESM): 6422 raw / 1678 gzip / 1504 brotli.
// 1.0.0 ships minified builds: raw bytes are ~33% lower; compressed bytes
// are budgeted below so future changes cannot silently bloat the bundle.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const BUDGET = {
  'dist/index.js': { raw: 4500, gzip: 1950, brotli: 1800 },
  'dist/index.cjs': { raw: 4600, gzip: 1900, brotli: 1750 },
  'dist/index.min.js': { raw: 4400, gzip: 1900, brotli: 1750 }
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
if (failed) process.exit(1);
