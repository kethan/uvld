import terser from '@rollup/plugin-terser';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

// Never ship leftovers from a previous build shape (e.g. old .es.js/.umd.js).
rmSync('dist', { recursive: true, force: true });

// Three minified bundles. Named ESM exports are preserved so bundlers can
// still tree-shake unused validators. No UMD build: the IIFE covers <script>.
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

const copyTypes = () => ({
  name: 'copy-types',
  writeBundle() {
    mkdirSync('dist', { recursive: true });
    copyFileSync('src/index.d.ts', 'dist/index.d.ts');
  }
});

export default {
  input: 'src/index.js',
  plugins: [copyTypes()],
  output: [
    { file: 'dist/index.js', format: 'es', plugins: [esm] },
    { file: 'dist/index.cjs', format: 'cjs', exports: 'named', plugins: [cjs] },
    { file: 'dist/index.min.js', format: 'iife', name: 'uvld', plugins: [iife] }
  ]
};
