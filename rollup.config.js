import terser from '@rollup/plugin-terser';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

// Never ship leftovers from a previous build shape (e.g. old .es.js/.umd.js).
rmSync('dist', { recursive: true, force: true });

// Three core bundles + two utils bundles + two async bundles. Both entries are minified; named ESM
// exports are preserved so bundlers can tree-shake. `./index.js` stays external
// for the utils build, so core code is never duplicated.
const base = {
  compress: { passes: 5, unsafe: true, unsafe_arrows: true, toplevel: true },
  format: { comments: false }
};
// Tree-shaking needs no special Terser options: the primitive factories are
// lazy (see `src/index.js`), so Terser may merge them into one comma-separated
// `const` statement and bundlers still drop the unused declarators. `comments:
// false` in `base` is enough — no annotation-preserving format option.
const esm = terser({ ...base, module: true, mangle: { toplevel: true } });
const cjs = terser({ ...base, mangle: { toplevel: true, reserved: ['exports', 'module', 'require'] } });
// The IIFE's `var uvld = ...` must survive: no top-level compression/mangling.
const iife = terser({
  ...base,
  compress: { ...base.compress, toplevel: false },
  mangle: { toplevel: false, reserved: ['uvld'] }
});

const copy = (from, to) => ({
  name: `copy-${to}`,
  writeBundle() {
    mkdirSync('dist', { recursive: true });
    copyFileSync(from, to);
  }
});

const core = {
  input: 'src/index.js',
  // `index.js` re-exports `utils.js`, which imports core helpers back. The
  // cycle is binding-only — no module reads the other at evaluation time — so
  // the single-chunk output is safe; don't warn about it on every build.
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('utils.js')) return;
    warn(warning);
  },
  plugins: [copy('src/index.d.ts', 'dist/index.d.ts')],
  output: [
    { file: 'dist/index.js', format: 'es', plugins: [esm] },
    { file: 'dist/index.cjs', format: 'cjs', exports: 'named', plugins: [cjs] },
    { file: 'dist/index.min.js', format: 'iife', name: 'uvld', plugins: [iife] }
  ]
};

// `uvld/utils` is a compatibility re-export of the main entry, so it stays a
// few bytes and never duplicates the utilities.
const utils = {
  input: 'src/utils-entry.js',
  external: ['./index.js'],
  plugins: [copy('src/utils.d.ts', 'dist/utils.d.ts')],
  output: [
    { file: 'dist/utils.js', format: 'es', plugins: [esm] },
    {
      file: 'dist/utils.cjs',
      format: 'cjs',
      exports: 'named',
      paths: id => id.includes('index.js') ? './index.cjs' : id,
      plugins: [cjs]
    }
  ]
};

const compileEntry = {
  input: 'src/compile.js',
  // The core stays external: the compiled entry only calls `is`/`safeParse`
  // on the generic path, so it never duplicates the library.
  external: ['./index.js'],
  plugins: [copy('src/compile.d.ts', 'dist/compile.d.ts')],
  output: [
    { file: 'dist/compile.js', format: 'es', plugins: [esm] },
    {
      file: 'dist/compile.cjs',
      format: 'cjs',
      exports: 'named',
      paths: id => id.includes('index.js') ? './index.cjs' : id,
      plugins: [cjs]
    }
  ]
};

const asyncEntry = {
  input: 'src/async.js',
  external: ['./index.js'],
  plugins: [copy('src/async.d.ts', 'dist/async.d.ts')],
  output: [
    { file: 'dist/async.js', format: 'es', plugins: [esm] },
    {
      file: 'dist/async.cjs',
      format: 'cjs',
      exports: 'named',
      paths: id => id.includes('index.js') ? './index.cjs' : id,
      plugins: [cjs]
    }
  ]
};

export default [core, utils, asyncEntry, compileEntry];
