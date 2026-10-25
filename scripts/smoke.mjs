// Consumer smoke test: pack the tarball, install it into a clean project and
// verify ESM import, CJS require, TypeScript resolution and issue behaviour.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = fileURLToPath(new URL('..', import.meta.url));
for (const f of ['dist/index.js', 'dist/index.cjs', 'dist/index.min.js', 'dist/index.d.ts', 'dist/utils.js', 'dist/utils.cjs', 'dist/utils.d.ts']) {
  if (!existsSync(join(repo, f))) {
    console.error(`MISSING ${f} — run \`npm run build\` first.`);
    process.exit(1);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'uvld-smoke-'));
const run = (cmd, args, cwd = repo) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

try {
  const packed = JSON.parse(run('npm', ['pack', '--pack-destination', tmp, '--ignore-scripts', '--json']));
  const tarball = join(tmp, packed[0].filename);
  const consumer = join(tmp, 'consumer');
  run('npm', ['install', '--prefix', consumer, tarball, '--offline', '--no-audit', '--no-fund', '--ignore-scripts']);

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'uvld-consumer-smoke', private: true, version: '1.0.0', type: 'module'
  }, null, 2));

  writeFileSync(join(consumer, 'esm.mjs'), `
import * as uvld from 'uvld';
const r = uvld.safeParse(uvld.object({ name: uvld.string() }), { name: 'ok' });
if (!r.success || r.data.name !== 'ok') throw new Error('ESM safeParse failed');
if (Object.keys(uvld).length !== 38) throw new Error('unexpected export count: ' + Object.keys(uvld).length);
console.log('ESM import: OK (' + Object.keys(uvld).length + ' exports)');
`);

  writeFileSync(join(consumer, 'cjs.cjs'), `
const uvld = require('uvld');
const r = uvld.safeParse(uvld.string(), 'ok');
if (!r.success || r.data !== 'ok') throw new Error('CJS safeParse failed');
if (!require.resolve('uvld').endsWith('index.cjs')) throw new Error('require resolved to the wrong file');
console.log('CJS require: OK (' + require.resolve('uvld') + ')');
`);

  writeFileSync(join(consumer, 'utils.mjs'), `
import { email, minLength, pipe, trim, ipv4, fallback, flatten, semver } from 'uvld/utils';
import { string, parse, safeParse } from 'uvld';
if (!safeParse(string('', [email(), minLength(5)]), 'ada@example.com').success) throw new Error('utils check failed');
if (parse(pipe(string(), trim()), '  hi  ') !== 'hi') throw new Error('utils pipe failed');
if (ipv4()('1.2.3.4') !== true) throw new Error('ipv4 failed');
if (parse(fallback(string(), 'guest'), 123) !== 'guest') throw new Error('fallback failed');
if (semver()('1.2.3') !== true) throw new Error('semver failed');
if (!flatten(safeParse(string(), 1).error)['']) throw new Error('flatten failed');
console.log('utils ESM import: OK');
`);

  writeFileSync(join(consumer, 'utils.cjs'), `
const u = require('uvld/utils');
const core = require('uvld');
if (u.email()('a@b.com') !== true) throw new Error('utils CJS failed');
if (core.parse(u.fallback(core.string(), 'guest'), 1) !== 'guest') throw new Error('utils fallback CJS failed');
if (!core.safeParse(core.string(), 'ok').success) throw new Error('core CJS failed');
if (!require.resolve('uvld/utils').endsWith('utils.cjs')) throw new Error('utils require resolved to the wrong file');
console.log('utils CJS require: OK');
`);

  writeFileSync(join(consumer, 'utils-types.ts'), `
import { email, pipe, trim, minLength, fallback, flatten, type Check, type TransformAction } from 'uvld/utils';
import { string, parse } from 'uvld';
const format: Check = email();
const action: TransformAction = trim();
const result = parse(pipe(string(), trim(), email()), ' a@b.com ');
const s: string = result;
const withDefault = parse(fallback(string(), 'guest'), 1);
const flat: Record<string, string[]> = flatten([]);
void [format, action, minLength, s, withDefault, flat];
`);

  writeFileSync(join(consumer, 'types.ts'), `
import { string, number, object, array, optional, parse, safeParse, is, Infer, VError, Issue } from 'uvld';
const User = object({ name: string(), age: number(), tags: array(string()), bio: optional(string()) });
type User = Infer<typeof User>;
const u: User = parse(User, { name: 'A', age: 1, tags: [], bio: undefined });
const r = safeParse(User, u);
if (r.success) { const name: string = r.data.name; void name; }
let value: unknown = 'x';
if (is(string(), value)) { const s: string = value; void s; }
const issue: Issue | undefined = r.success ? undefined : r.error.issues[0];
if (issue) { const p: string = issue.path; void p; }
const e = new VError('x', []);
void e.issues;
`);

  console.log(run('node', ['esm.mjs'], consumer).trim());
  console.log(run('node', ['cjs.cjs'], consumer).trim());
  console.log(run('node', ['utils.mjs'], consumer).trim());
  console.log(run('node', ['utils.cjs'], consumer).trim());
  const tsc = join(repo, 'node_modules', '.bin', 'tsc');
  for (const [label, args] of [
    ['node16/nodenext', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', 'types.ts']],
    ['bundler', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', 'types.ts']],
    ['node10', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node10', 'types.ts']]
  ]) {
    run(tsc, args, consumer);
    console.log(`TypeScript (${label}): OK`);
  }
  for (const [label, args] of [
    ['utils/nodenext', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', 'utils-types.ts']],
    ['utils/bundler', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', 'utils-types.ts']],
    ['utils/node10', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node10', 'utils-types.ts']]
  ]) {
    run(tsc, args, consumer);
    console.log(`TypeScript (${label}): OK`);
  }

  // The CDN build must expose an unmangled global.
  const sandbox = {};
  createContext(sandbox);
  runInContext(readFileSync(join(repo, 'dist/index.min.js'), 'utf8'), sandbox);
  if (!sandbox.uvld || Object.keys(sandbox.uvld).length !== 38) {
    throw new Error('IIFE build did not expose the uvld global');
  }
  console.log('IIFE/browser global: OK (38 exports)');

  const pkg = JSON.parse(readFileSync(join(consumer, 'node_modules/uvld/package.json'), 'utf8'));
  const targets = [
    pkg.types, pkg.main, pkg.module, pkg.browser, pkg.unpkg,
    ...Object.values(pkg.exports['.']),
    ...Object.values(pkg.exports['./utils']),
    './utils.d.ts'
  ];
  for (const target of targets) {
    if (typeof target === 'string' && target.startsWith('./') &&
        !existsSync(join(consumer, 'node_modules/uvld', target))) {
      throw new Error(`manifest points at a missing file: ${target}`);
    }
  }
  console.log('manifest targets: OK');
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) {
    throw new Error('published package must have zero runtime dependencies');
  }
  console.log('runtime dependencies: 0');
  console.log('\nconsumer smoke test: PASS');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
