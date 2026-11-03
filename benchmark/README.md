# Benchmark

Compares **uvld** with **zod**, **valibot**, **yup**, **joi** and **ajv** on two
axes:

1. **Runtime throughput** — schema creation and validation of the same payload.
2. **Bundle size** — what a consumer ships for a given import, bundled with
   esbuild (the method [bundlejs](https://bundlejs.com) uses) *and* with
   Rollup + Terser (they differ a lot for some packages).

## Run it

```bash
# from the repository root
npm run build               # the size benchmark reads dist/index.js
npm run bench:install       # once — installs the comparison libraries
npm run bench
```

`BENCH_QUICK=1` shortens the samples; `node benchmark/runtime.mjs` and
`node benchmark/size.mjs` run one half each.

Results are written to [`RESULTS.md`](RESULTS.md) and `RESULTS.json`; the
console output is a readable summary. The benchmark is **not** part of
`npm run check` — it needs its own dependencies and takes a couple of minutes.

## What is measured

One schema, implemented by every library in `schemas.mjs`:

```js
{
  name: string (2–50 chars),
  email: email format,
  age: number, integer 18–120,
  tags: string[],
  address: { city: string, zip: 5 digits }
}
```

Runtime cases: create the schema, validate a valid object, reject an invalid
one, validate an array of 100, validate a string, validate an email. Every
adapter returns a boolean, so throw-based APIs (yup) and result-based APIs
(zod/valibot/uvld/joi/ajv) both include their error construction; schema
creation is a separate row, which is where ajv's compile step lands.

Size cases: `string` (one min-length check), `email`, `user` (the schema
above), and `full` (a namespace import, i.e. no tree-shaking — the upper bound
that `require()` and CDN users actually pay).

## Fairness notes

- **No coercion.** yup runs with `strict: true`, joi with `convert: false`.
  uvld and zod return the input; yup/joi can transform it.
- **ajv is a different model.** It compiles a JSON Schema to a specialised
  function: expensive to create, fast to reuse. Its `email` check is a regex
  because `format: 'email'` needs `ajv-formats`.
- **Two bundlers, reported separately.** esbuild cannot tree-shake zod 4's
  namespace re-export (`export { z }`), so it ships ~90 kB gzip where Rollup
  ships ~20 kB. Both are real; pick the column that matches your toolchain.
  yup/joi/ajv are CommonJS, so neither bundler can shake them.
- **One schema.** Libraries optimise different things. Treat this as a starting
  point and benchmark your own shapes.

## Adding a library

Add an entry to `schemas.mjs` with the four builders plus `version`, add a
`size.mjs` entry block with the four cases, and re-run. Keep the schema
identical — the harness refuses to run if the libraries disagree on the
fixtures.
