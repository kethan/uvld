# Changelog

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
