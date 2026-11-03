# Changelog

## Unreleased (1.3.0)

### Added

- **`uvld/compile`** — an opt-in entry point that walks a schema once and
  returns a plain boolean predicate with the structure unrolled: no context
  objects, no path strings and no issue arrays on the success path.
  `compile(schema)` is `is(schema, value)` as a closure tree, cached per schema
  object; `compileParse(schema)` returns a `safeParse`-shaped function that
  re-runs `safeParse()` on rejection so the `VError` and its issues are
  preserved. Nodes it cannot unroll (`or`, `and`, `not`, `lazy`, `transform`,
  `custom`, user-defined kinds) delegate to the generic validator, so it never
  disagrees with `is()`. It keeps the interpreter's rules: own properties only,
  `strict()` extra-key rejection, symbol keys, the 64-level depth guard, and
  "a throw means invalid". Shipped as ESM + CJS with declarations and the same
  legacy `node10` shim as the other subpaths; the core stays external.
- **`benchmark/compile.mjs`** — compiled predicates measured on the same
  fixtures and schema builders as the main benchmark, against the generic
  validator, zod, valibot and ajv, with a correctness gate that refuses to time
  anything until the predicate agrees with `is()`/`safeParse()`. `run.mjs` now
  writes the section into `RESULTS.md`/`RESULTS.json`.
- **`benchmark/`** — a reproducible comparison against zod, valibot, yup, joi
  and ajv on one schema: runtime throughput (schema creation, valid/invalid
  object, 100-item array, string, email) and consumer bundle size (esbuild and
  Rollup, gzip/brotli), with a correctness gate that refuses to time anything
  until all six libraries agree on the fixtures. `npm run bench:install &&
  npm run bench` writes `benchmark/RESULTS.md` and `RESULTS.json`. The
  checked-in run has uvld fastest to build the schema and smallest for the
  tree-shaken import, within ~1.4× of zod and valibot on object validation.

### Performance

- **`compile()` validates the benchmark object in 565 ns instead of 1,202 ns**
  (2.1×; a 100-item array goes 131 µs → 57 µs) and rejects an invalid object in
  226 ns instead of 6,552 ns (~29×), since no context or `VError` is built.
  `compile()` itself costs ~9.4 µs per schema, one-off. The core entry is
  unchanged in behaviour and API; the opt-in entry is 2,703 B raw / 1,131 B
  gzip with the core external.
- **Schema metadata for the compiler costs ~130 B raw / ~65 B gzip** in the
  core bundle: structural nodes (`object`, `array`, `set`, `tuple`, `record`,
  `map`) publish their shape/item/entries through an internal `composite()`
  helper that keeps the structural walk out of the published metadata. Schema
  creation is ~12% slower (1.07 µs → 1.19 µs for the five-field schema) and
  object validation is unchanged.
- **Object validation is ~3.6× faster** (4.1 µs → 1.1 µs for the benchmark's
  five-field payload; a 100-item array goes 411 µs → 104 µs). Schema creation
  and bundle size are unchanged in character: `object()` now computes its key
  list and bracket-quoted path suffixes once, on first use, instead of calling
  `Reflect.ownKeys()` and `JSON.stringify()` for every key on every validation;
  `define()`, `items()`, `pairs()`, `tuple()`, `wrap()` and `and()` loop instead
  of `flatMap()`, which removes a callback closure and an array per refinement;
  and child contexts are built as plain literals instead of a spread.
- **Costs ~540 B raw / ~200 B gzip** in the full bundle (`dist/index.js`
  18,973 → 19,515 B raw, 6,706 → 6,913 B gzip), and ~45 B gzip on the smallest
  tree-shaken import (`is(string(), 1)`: 517 → 585 B gzip). The byte budgets
  were raised accordingly. Schema objects are read once, on first use, so keys
  added to the schema object afterwards are no longer picked up.
- **`safeParse` on invalid input is still dominated by `new VError`** (~3.3 µs
  of the ~6 µs), which valibot avoids by returning a plain object. `is()` skips
  error construction entirely when only a boolean is needed.

## 1.2.0 (2026-11-02)

Every synchronous validator now ships from the single `uvld` entry point.
Additive: `import ... from 'uvld'` gains 158 names and every 1.x import keeps
working.

### Changed

- **Utilities moved into `uvld`.** `import { string, email, pipe } from 'uvld'`
  replaces the second `uvld/utils` import. `uvld/utils` stays as a 73-byte
  re-export shim, so existing code needs no change. The utilities' integer
  **check** is exported as `integerCheck` from `uvld` — `integer()` is the core
  schema factory — while `uvld/utils` still exports it as `integer`.
- **Every utility factory is lazy**, like the core primitives: `fmt()`,
  `limit()` and `meta()` run when a check is requested, not at module load.
  Without this, esbuild and webpack keep every utility in any bundle that
  imports the core (a one-schema import cost 2.8 kB gzip instead of 530 B).
  It also fixes the 1.x `uvld/utils` bundle: with esbuild, the six-name set
  from valibot's bundle-size example (`email, minLength, nonEmpty, object,
  string, pipe`) cost 3,221 B gzip before and 1,286 B now, and a lone `email`
  import drops from 2,444 B to 155 B. For the same six names, valibot 1.5.0
  measures 1,397 B gzip with the same toolchain. The utilities' `transform` is
  re-exported by binding rather than copied, so `uvld.transform ===
  require('uvld/utils').transform` and there is no top-level circular read.
- **Bundle sizes.** One file now carries the core plus all utilities:
  `dist/index.js` 18,973 B / 6,706 B gzip (was 4,530 / 1,935), `index.cjs`
  18,811 / 6,076 (was 4,585 / 1,818), `index.min.js` 17,684 / 6,018 (was
  4,392 / 1,797). Only CJS and IIFE consumers pay that growth, because only ESM
  tree-shakes: `is(string(), 1)` is still 517 B gzip with Rollup and 529 B with
  esbuild, and a lone `email()` is 154 / 160 B. `uvld/utils` shrinks from
  13,608 B to 73 B since it no longer duplicates the utilities.
- **`uvld/async` is unchanged** and still opt-in, but it imports the unified
  core, so `require('uvld/async')` now loads the utilities along with it.
- Size budgets track the new bundle shape; the shim gets tiny budgets of its
  own so it cannot quietly grow back into a second copy.

## 1.1.1 (2026-11-02)

### Fixed

- **Tree-shaking for esbuild and webpack.** Terser merges the 13 primitive
  schema factories into a single comma-separated `const` statement, so importing
  one schema dragged in all of them — a consumer doing `is(string(), 1)` shipped
  708 B gzip instead of ~520 B. The primitives are now **lazy factories**: each
  export is a plain function that calls `define()` when a validator is requested,
  never at module load. An unimported factory is therefore just an unreferenced
  arrow function, which every bundler drops — no `/*#__PURE__*/` markers and no
  `preserve_annotations` Terser format option. Measured for `is(string(), 1)`:
  Rollup 520 B gzip, esbuild 529 B gzip — the two bundlers now agree within ~2%,
  where esbuild previously lagged by 188 B. Cost: +156 raw / +16 gzip bytes on
  `dist/index.js` (4,374 → 4,530 B); CJS and IIFE gain ~104 raw bytes each but
  shrink under gzip (1,853 → 1,818 B and 1,835 → 1,797 B). `sideEffects: false`
  was already declared.

## 1.1.0 (2026-10-25)

Additive: a new `uvld/async` entry point and a fix for a type/runtime mismatch
in `Context.out`. The synchronous API is unchanged.

### Fixed

- `Context.out` was declared in `src/index.d.ts` but never provided at runtime —
  a `custom((v, c) => ...)` refinement saw `c.out === undefined`. `parse` and
  `safeParse` now create a fresh per-evaluation context with a real shared
  `{ set, value }` box; `seg()` propagates the same reference to every child and
  a root transform writes into it. This removes the module-level `out` variable,
  which would have raced under `await`. Cost: +59 raw bytes to the core ESM
  bundle (4,315 → 4,374 B).

### Added — `uvld/async`

A third, opt-in, tree-shakeable entry point with 21 exports and its own
await-aware kernel (`src/async.js` / `src/async.d.ts`). It imports the core as
an external module, so no core code is duplicated.

- **Entry points:** `parseAsync`, `safeParseAsync`, `isAsync`, `evaluateAsync`,
  all accepting `{ timeout, signal }`. Rejected async validators become
  `Threw: ...` issues (matching sync `safeParse`); `parseAsync` rejects with
  `VError`.
- **Async-aware combinators:** `customAsync`, `objectAsync`, `strictAsync`,
  `arrayAsync`, `tupleAsync`, `orAsync`, `andAsync`, `optionalAsync`,
  `nullableAsync`. They accept ordinary sync `uvld` schemas as children.
  `objectAsync` uses `Promise.all` (key order preserved → deterministic first
  issue); `orAsync` stays sequential to preserve short-circuit.
- **Actions:** `checkAsync`, `rawCheckAsync`, `transformAsync`, `pipeAsync`,
  `fallbackAsync`, `messageAsync`. `pipeAsync` accepts async transforms/checks
  and the tagged actions from `uvld/utils`.
- **Helpers:** `resolveAsync` (deep-await promises inside plain objects/arrays;
  leaves `Date`/`Map`/`Set` alone and survives cycles), `withTimeout`.
- `./async` export conditions with `types`/`import`/`require`/`default`, a
  legacy `async.d.ts` node10 shim, `examples/async.mjs`, 24 async tests,
  size budgets for both async bundles and consumer smoke tests for
  ESM/CJS/TypeScript across nodenext, bundler and node10.

Caveats documented in the README: `isAsync` is not a type guard; async
refinements must not be placed in a sync schema's `validations` array; timeouts
bound the wait but do not cancel in-flight work (use `context.signal`).

Suite: **186 tests** and **10 runnable examples**; `npm audit` 0 vulnerabilities.

## 1.0.0 (2026-10-25)

Production release. Same tiny idea, but the validation semantics, TypeScript
surface and package layout are now reliable. **Breaking changes vs 0.0.1.**

### Fixed (correctness)

- `or()` no longer counts issues: each branch is tested on its own result,
  short-circuits, aggregates branch issues, and `or()` with no branches fails.
- `record()` now validates symbol keys (it used `Object.entries`, which skipped
  them entirely) and rejects non-plain objects.
- `object()` / `strict()` use own properties only (the prototype chain can no
  longer satisfy a key), accept symbol keys in schemas, and reject `Date`,
  `Map`, `Set`, `Promise` and arrays. `strict()` reports extra keys *and* field
  errors instead of short-circuiting.
- `min()` / `max()` take `(bound, message?, validations?)`; a custom message no
  longer throws `validations.flatMap is not a function`. Unsupported inputs
  produce a clean issue instead of raw JS coercion or a `TypeError`.
- `number()` rejects `NaN`/`±Infinity`; `date()` rejects invalid dates;
  `promise()` accepts thenables; `literal()` uses `Object.is` (so `NaN` works);
  `enums()` and `instance()` validate their arguments up front.
- `optional()` / `nullable()` preserve nested issues (paths, origins, count)
  instead of replacing them with a generic error.
- `transform()` returns the transformed value at the root of `parse` /
  `safeParse`, applied exactly once.
- `safeParse()` / `is()` never throw: exceptions from user validators become
  issues. Circular/deep input is bounded by a depth guard.
- Issues are always well-formed `Issue` objects, even when a refinement returns
  `false`, a string, or a partial object. `origin` propagates through every
  combinator. `received` is a type tag, never the raw value (no secrets in logs).
- Paths use unambiguous bracket segments, e.g. `["user"]["tags"][0]`.

### Fixed (TypeScript & packaging)

- `define` is now exported at runtime and `unknown` is declared in the types;
  runtime exports and declarations are checked against each other in CI.
- `types` points at the real `dist/index.d.ts`; `exports` has a `types`
  condition first and a reachable `require` condition pointing at a real
  `.cjs` file. `module` points at ESM, `main` at CJS.
- `is()` is a type guard; `Infer` works for objects, tuples, unions, literals
  and enums; `object()` no longer adds an `any` index signature.
- The abandoned `src/try.ts` prototype (18 type errors, conflicting `Issue`
  shape) was removed.

### Changed / added


### Added — `uvld/utils` (opt-in entry point)

158 exports in a separate, tree-shakeable `uvld/utils` entry point. The core
bundle is **byte-identical** (4,315 B) — `dist/utils.js` imports the core as an
external module instead of bundling it.

- **Formats (40+):** `base64`, `bic`, `creditCard` (Luhn), `cuid2`, `decimal`,
  `digits`, `domain`, `email`, `rfcEmail`, `emoji`, `hexadecimal`, `hexColor`,
  `imei` (Luhn), `ip`, `ipv4`, `ipv6`, `isbn` (checksum), `isrc`, `isoDate`,
  `isoDateTime`, `isoDateTimeSecond`, `isoTime`, `isoTimeSecond`,
  `isoTimestamp`, `isoWeek`, `jwsCompact`, `ksuid`, `mac`, `mac48`, `mac64`,
  `mimeType`, `nanoid`, `octal`, `slug`, `ulid`, `url`, `uuid`, `hash`.
- **Constraints (40+):** exact/min/max/not for `length`, `bytes`,
  `codePoints`, `graphemes` (`Intl.Segmenter`), `words`, `size`, `entries`,
  plus `minValue`, `maxValue`, `gtValue`, `ltValue`, `value`, `notValue`,
  `notValues`, `values`, `multipleOf`, `finite`, `integer`, `safeInteger`,
  `empty`, `nonEmpty`.
- **Membership & items:** `includes`, `excludes`, `startsWith`, `endsWith`,
  `regex`, `check`, `rawCheck`, `partialCheck`, `guard`, `everyItem`,
  `someItem`, `checkItems`, `mapItems`, `filterItems`, `sortItems`,
  `reduceItems`, `findItem`.
- **Transforms:** `trim`, `trimStart`, `trimEnd`, `toLowerCase`, `toUpperCase`,
  `toCamelCase`, `toPascalCase`, `toKebabCase`, `toSnakeCase`, `normalize`,
  `toNumber`, `toBoolean`, `parseBoolean`, `toBigint`, `toDate`, `toString`,
  `toMinValue`, `toMaxValue`, `parseJson`, `stringifyJson`, `rawTransform`,
  `transform` (core re-export).
- **Composition & metadata:** `pipe` (transforms + checks in one schema, with
  transformed data at the root), `args`, `returns`, `readonly`, `title`,
  `description`, `metadata`, `examples`, `brand`, `flavor`.
- **Production gap review — 29 more helpers:** `fallback` (default value on
  failure), `message` (override issue text, keeps nested paths), `flatten`
  (`{ path: messages[] }` map from an `Issue[]` or `VError`), `nonNullable`,
  `nonOptional`, `nonNullish`; formats `alpha`, `alphaNumeric`, `lowercase`,
  `uppercase`, `ascii`, `semver`, `json`; numeric/date constraints `positive`,
  `negative`, `nonNegative`, `nonPositive`, `inRange`, `minDate`, `maxDate`;
  collections `uniqueItems`, `toUnique`, `compactItems`, `reverseItems`;
  string transforms `toTitleCase`, `truncate`, `padStart`, `padEnd`, `replace`.
  All are opt-in and the core bundle remains byte-identical.
- Declarations (`dist/utils.d.ts`), a legacy `utils.d.ts` node10 shim,
  `./utils` export conditions, `examples/utils.mjs`, 99 utility tests,
  size budgets for both utils bundles, and consumer smoke tests for
  ESM/CJS/TypeScript (all three resolution modes).

- **Uniform signature for every validator factory:**
  `factory(..., message?: string, validations?: Validator[])`.
- Zero runtime dependencies (the build-size plugin moved to dev tooling).
- Three minified bundles (ESM, CJS, IIFE) instead of four; UMD dropped.
- `npm run typecheck`, `size`, `smoke`, `examples`, `check`; enforced byte
  budget; consumer smoke test for ESM/CJS/TypeScript across three resolution
  modes; CI on Node 20/22 with a dependency audit.
- 9 runnable, assert-based examples and a 158-test suite covering every
  regression above and every utility.
- `LICENSE` (ISC) added; README now matches `package.json`. Node >= 20.

### Migration notes

| 0.0.1 | 1.0.0 |
| --- | --- |
| `min(5, 'msg')` | same call now works (was treated as `validations`) |
| `literal(1, 'msg', validator)` | `literal(1, 'msg', [validator])` |
| `custom(fn, 'msg', validator)` | `custom(fn, 'msg', [validator])` |
| `err.issues[0].received` = raw value | `received` = type tag string |
| `err.issues[0].path = 'a.b'` | `path = '["a"]["b"]'` |
| message `Expected string, received number` | `Expected string, got number` |
| `require('uvld')` resolved to ESM | resolves to `dist/index.cjs` |
| `object({})` accepted `Date`/`Map`/`Set` | rejects non-plain objects |
| `number()` accepted `NaN` | rejects non-finite numbers |
| `transform()` output unchanged | root transform returns transformed data |
