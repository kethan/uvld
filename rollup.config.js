import terser from '@rollup/plugin-terser';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

// Never ship leftovers from a previous build shape (e.g. old .es.js/.umd.js).
rmSync('dist', { recursive: true, force: true });

// Three core bundles + two utils bundles. Both entries are minified; named ESM
// exports are preserved so bundlers can tree-shake. `./index.js` stays external
// for the utils build, so core code is never duplicated.
const base = {
  compress: { passes: 5, unsafe: true, unsafe_arrows: true, toplevel: true },
  format: { comments: false }
};
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
  plugins: [copy('src/index.d.ts', 'dist/index.d.ts')],
  output: [
    { file: 'dist/index.js', format: 'es', plugins: [esm] },
    { file: 'dist/index.cjs', format: 'cjs', exports: 'named', plugins: [cjs] },
    { file: 'dist/index.min.js', format: 'iife', name: 'uvld', plugins: [iife] }
  ]
};

const utils = {
  input: 'src/utils.js',
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

export default [core, utils];
