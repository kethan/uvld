# `uvld` — Complete Project Analysis

> **Historical audit.** This document describes the **0.0.1** code as it was before the production hardening. Every finding below was addressed in **1.0.0** — see [`CHANGELOG.md`](CHANGELOG.md) for the fix list and [`README.md`](README.md) for the current API. It is kept as an audit trail of what was wrong and why.

**Analysed:** 2026-10-25 · **Branch:** `arena/b1f58879-uvld` · **Commit:** `d7284ac70961751fbb8d9e86fa395781f62470a2` ("first commit", 2024-09-23)
**Verification environment:** Node v22.22.3, npm 10.9.8, TypeScript 5.6.3, Vitest 2.1.1 (from the repo's lockfile)
**Scope:** all 10 tracked files, build output, published npm artifact, GitHub metadata, and black-box behaviour of all 37 runtime exports.

> This document is an analysis only. No source file was changed. `dist/` and `node_modules/` were generated locally and are git-ignored.

---

## 1. Executive summary

`uvld` is a tiny (168-line core, ~1.7 kB gzipped) JavaScript schema-validation library in the Zod/Valibot family. It has **zero runtime dependencies in the library code**, a handwritten `.d.ts`, four Rollup bundles, a 385-line Vitest suite, and a detailed README. It builds, publishes, and passes its 26 tests.

It is, however, **prototype-quality and not production-safe**. The repository is a single commit from September 2024 with no tags, releases, issues, PRs, visible CI runs, or detected license; npm has exactly one version (`0.0.1`) published the same day. More importantly, black-box probing found **validation logic that returns success for invalid data**, an **exported-but-broken TypeScript surface**, and a **package manifest that ships the wrong module formats to consumers**.

### Verdict

| Dimension | Rating | Note |
|---|---|---|
| Concept / ergonomics | Good | Small, dependency-free, composable validator factory |
| Core correctness | **Poor** | `or`, `record`, `object`, `min`/`max`, `optional`, `safeParse` have confirmed defects |
| TypeScript support | **Broken** | `define` typed but not exported; `unknown` exported but not typed; `types` path points to a non-existent file |
| Packaging / distribution | **Broken** | `require` condition unreachable; CJS consumers get ESM; `module` field points at CJS |
| Test suite | Weak | 26 shallow tests; false confidence from a "Complex" test that validates nothing |
| Documentation | Fair | Broad README, but duplicate section, wrong signatures, 6 undocumented exports, MIT vs ISC conflict |
| Maintenance / security | **Stale** | 2 years untouched; 14 dependency advisories (2 critical, 9 high, 3 moderate) |
| Overall | **Not production-ready** | Usable for learning/experiments; needs a P0 hardening pass before any real use |

### Top risks at a glance

| ID | Severity | Finding |
|---|---|---|
| F1 | Critical | `or()` decides success by counting issues → **accepts invalid values** |
| F2 | Critical | `record()` uses `Object.entries` → **silently skips all symbol-keyed data** |
| F3 | Critical | `object()` reads inherited properties → **validation bypass** |
| F4 | Critical | Type/runtime export mismatch + wrong `types` path → **TypeScript consumers broken** |
| F5 | High | `min`/`max` treat 2nd argument as `validations` → **TypeError on valid input** |
| F6 | High | `safeParse()` has no `try/catch` → **"safe" API throws raw exceptions** |
| F7 | High | `exports` key order shadows `require` → **CJS consumers load ESM** |
| F8 | High | `optional`/`nullable` discard all inner issues → **useless error reports** |
| F9 | High | `transform()` never transforms output → **silently wrong data** (test commented out) |
| F10 | Medium | Issues embed raw values → **secrets can leak into logs** |

---

## 2. Repository inventory

| File | Lines | Purpose | Health |
|---|---:|---|---|
| `src/index.js` | 169 | **The entire library**: 37 exports, ESM, no imports | Works, but 15+ confirmed defects; no comments/JSDoc |
| `src/index.d.ts` | 251 | Handwritten public typings | Diverges from runtime (F4); weak inference |
| `src/try.ts` | 156 | Abandoned TypeScript rewrite/prototype | Dead code: not built, not exported, 18 `tsc --strict` errors, references undefined `UnionToIntersection` |
| `index.spec.ts` | 385 | Single Vitest describe block, 26 tests | All pass, but shallow; 2 strict-TS errors; `transform` test commented out |
| `README.md` | 252 | Install, usage, API reference, license note | Duplicate section, wrong signatures, 6+ exports undocumented, MIT vs ISC conflict |
| `package.json` | 47 | Manifest; `uvld@0.0.1`, `type: module` | Multiple packaging defects (§8) |
| `package-lock.json` | 3,316 | Lockfile v2, `npm ci` succeeds | Root name/version is **`uvalid@1.0.0`** — mismatched with manifest |
| `rollup.config.js` | 45 | 4 outputs (ES/CJS/IIFE/UMD) + copy `.d.ts` | Builds; plugins duplicated per output; no sourcemaps |
| `.github/workflows/node.js.yml` | 26 | Node 18: `npm ci` → build → `npm test` | No typing/lint/coverage/pack check; old actions; no recorded runs |
| `.gitignore` | 24 | Ignores `dist`, `node_modules`, logs, editors | Fine |

**Total:** 10 files, ~1,327 lines of hand-written code/config (4,671 insertions including the lockfile). One commit, one author (Kethan Surana), no branches of substance, no tags.

---

## 3. Project history & ecosystem health

| Signal | Observation |
|---|---|
| Git history | 1 commit (`d7284ac`), 2024-09-23; upstream commit count = 1 |
| Last push | 2024-09-23 — **~25 months stale** as of this analysis |
| npm | `uvld@0.0.1` published 2024-09-23; only one version; `dist-tags.latest = 0.0.1` |
| GitHub | 0 stars, 0 forks, 0 issues, 0 PRs, 0 releases, 0 tags, `licenseInfo: null` |
| CI | Workflow exists and README shows a badge, but `gh run list` returns **no runs** |
| License | README says **MIT**; `package.json` says **ISC**; no `LICENSE` file → legally ambiguous |
| Missing project files | `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `tsconfig.json`, lint/format config, `engines`, `sideEffects`, keywords (empty), description is just `"validator"` |

**Consequence:** there is no way to map the published artifact to a tagged release, no security contact, and no maintenance signal. Anyone adopting this package must be prepared to fork it.

---

## 4. Architecture & design

### 4.1 The core idea (`src/index.js`)

Everything is built on one 5-line factory:

```js
const define = (type, validate) =>
  (message = '', validations = []) =>
    (value, path = "", origin = "value", issues = []) => !validate(value)
      ? [{ message: message || `Expected ${type}, received ${typeof value}`,
           expected: type, received: value, path, origin }]
      : (issues = validations.flatMap(v => v(value, path)).filter(v => v !== true),
         issues.length ? issues : []);
```

- A **validator** is a function `(value, path?, origin?) => array`. An empty array means success; a non-empty array means failure, where each element *should* be an issue object.
- `define(type, predicate)` produces a validator factory. Primitives (`string`, `number`, `boolean`, `func`, `symbol`, `bigint`, `integer`, `date`, `promise`, `never`, `any`, `unknown`, `nullish`) are one-liners on top of it.
- Composite types (`record`, `map`, `array`, `set`, `object`, `strict`, `tuple`) inject themselves into the `validations` array and recursively call child validators with a concatenated `path` string.
- `optional`/`nullable` wrap a child in another `define` predicate.
- Combinators: `or`, `and`, `not`, `lazy`, `transform`, `min`, `max`.
- Entry points: `is` (`.length === 0`), `parse` (throw `VError`), `safeParse` (result union), `VError extends Error` with `.issues`.

**Strengths:** genuinely tiny, no runtime deps, schema-as-function makes composition trivial, `lazy()` enables recursive schemas, ESM named exports are tree-shakeable, the whole library is easy to read in one sitting.

**Structural weaknesses:**
1. The issue protocol is **untyped at runtime** — `validations` may return `true`/`false`, an object, or an array; `define` only filters `!== true`, so `false` and arbitrary objects become "issues" (F11).
2. `path`/`origin` are passed **inconsistently** (F12). There is no context object, no abort/short-circuit, no error-code taxonomy.
3. Validation is **pure type-checking only** — `parse()` returns the *original* reference (verified), so there is no coercion, defaults, cloning, or real transformation.
4. Three incompatible `Validator`/`Issue` contracts exist: `src/index.js` (implicit), `src/index.d.ts` (`Issue<T>{expected, received}`, `Validator<T> => Issue<T>[] | boolean`), and `src/try.ts` (`Issue<T>{type, value}`, `Validator<T> => Issue<T>[] | boolean[]`).

### 4.2 Build & distribution pipeline

```
src/index.js  --rollup-->  dist/index.es.js   (ESM,  6.42 kB / 1.68 kB gz)
                           dist/index.js      (CJS,  7.03 kB / 1.78 kB gz)
                           dist/index.min.js  (IIFE, 3.28 kB / 1.27 kB gz, global `uvld`)
                           dist/index.umd.js  (UMD,  3.47 kB / 1.35 kB gz)
src/index.d.ts --copy-->   dist/index.d.ts   (5,799 bytes)
```

`npm pack --dry-run` → 7 files, 7.5 kB tarball, 36 kB unpacked. The published `uvld@0.0.1` tarball contains exactly these files.

### 4.3 Public API (37 runtime exports)

| Group | Exports |
|---|---|
| Primitives (13) | `string, number, boolean, func, symbol, bigint, integer, date, promise, never, any, unknown, nullish` |
| Literal/enum (3) | `literal, instance, enums` |
| Wrappers (3) | `optional, nullable, custom` |
| Composites (7) | `record, map, array, set, object, strict, tuple` |
| Constraints (2) | `min, max` |
| Combinators (5) | `or, and, not, lazy, transform` |
| Entry points (4) | `is, parse, safeParse, VError` |

Typed in `src/index.d.ts`: 36 constants/functions + `Issue`, `Validator`, `Infer`, `UnionToIntersection`, `VError` — **but it declares `define` (not exported at runtime) and omits `unknown` (exported at runtime)**.

---

## 5. Verification performed

| Check | Command | Result |
|---|---|---|
| Install | `npm ci --no-audit --no-fund` | ✅ 121 packages; deprecation warnings; lockfile root name mismatch tolerated |
| Build | `npm run build` | ✅ 4 bundles + copied `.d.ts` in 553 ms |
| Tests | `npx vitest run --reporter=verbose` | ✅ **26/26 pass**, 273 ms, 1 file |
| Package | `npm pack --dry-run --json` | ✅ 7 files, 7,544 bytes |
| ESM consumer | `import * as v from 'uvld'` on packed tarball | ✅ 37 exports, `safeParse(string(),'ok')` works |
| CJS consumer | `require('uvld')` on Node 22 | ⚠️ resolves to `dist/index.es.js` (**ESM**), not the CJS bundle |
| Types (nodenext) | `tsc --strict --module nodenext` on consumer | ❌ `unknown` missing; types only found by accidental `main` fallback |
| Types (bundler/node10) | `tsc --strict --moduleResolution bundler\|node10` | ❌ **TS7016: no declaration file for `uvld`** |
| Runtime `define` | `import { define } from 'uvld'` | ❌ `SyntaxError: does not provide an export named 'define'` |
| Repo spec typecheck | `tsc --strict ... index.spec.ts` | ❌ 2 errors (TS7022, TS7024 — implicit `any` on recursive `Node`) |
| `src/try.ts` typecheck | `tsc --strict ... src/try.ts` | ❌ 18 errors incl. `Cannot find name 'UnionToIntersection'` |
| Direct `main` load | `import('./dist/index.js')` under `type: module` | ❌ `ReferenceError: exports is not defined in ES module scope` |
| Dependency audit | `npm audit --json` | ❌ 14 advisories: **2 critical, 9 high, 3 moderate** |
| Black-box probes | ~60 assertions against `src/index.js` | ❌ ~20 distinct behavioural defects (§6) |

---

## 6. Detailed findings

### 6.1 Critical — correctness of the core promise

#### F1 · `or()` counts issues instead of checking per-branch success — `src/index.js:99-102`

```js
const or = (...schemas) => (value, path) => {
  const issues = schemas.map(schema => schema(value, path)).flat();
  return issues.length === schemas.length ? issues : [];
};
```

This assumes **every failing schema returns exactly one issue**. Any branch producing 2+ issues breaks the count. The bug works in **both directions**: false positives (invalid data accepted) and false negatives (valid data rejected even when a branch succeeded).

Verified reproductions:

```js
or(array(string()), number())                       // [1,2,3]  → success:true (should fail)
or(object({a:string(),b:string()}))                 // {a:1,b:2} → success:true (single branch, 2 issues)
or(object({a:string(),b:string()}), string())      // {a:1,b:2} → success:true (3 issues vs 2 schemas)
or()                                               // anything → success:true
or(array(string()), any())                         // [1,2]    → success:false, although any() passed (2 issues = 2 schemas)
```

**Impact:** unions are the primary way to express alternatives; a union used inside `array`, `object`, or `strict` will accept arbitrarily wrong data. Security-relevant if used for authorization/type gating. Also **no short-circuit** — all branches always execute (side effects + wasted work).
**Fix:** evaluate per branch and check each branch's own result:

```js
const or = (...schemas) => (value, path, origin) => {
  const branches = schemas.map(s => s(value, path, origin));
  return branches.some(issues => issues.length === 0) ? [] : branches.flat();
};
```

#### F2 · `record()` never sees symbol keys — `src/index.js:30`

`Object.entries(value)` enumerates string keys only. `record(symbol(), …)` therefore validates **nothing at all** whenever the record uses symbol keys — the exact use case shown in the "Complex" test (`index.spec.ts:246, 261, 303, 337`).

```js
const rec = record(symbol(), map(string(), string()));
safeParse(rec, { [Symbol('k')]: 'NOT A MAP' }); // → { success: true, data: … }
```

**Impact:** the flagship "Complex" test passes **vacuously** — it is not testing record validation at all. This is the most dangerous kind of false test confidence.
**Fix:** include `Object.getOwnPropertySymbols(value)` (stringify symbol keys for `path`) and fix `origin` propagation.

#### F3 · `object()` / `strict()` read the prototype chain — `src/index.js:78`

`schema[key](value[key], …)` uses plain property access, so an inherited property satisfies a required key:

```js
Object.prototype.isAdmin = false;
safeParse(object({ isAdmin: custom(v => v === false, 'must be false') }), {});
// → success:true, data:{}   (key never existed)
```

Combined with any prototype-pollution vector elsewhere in an application, this is a **validation bypass**. `Object.keys(schema)` also ignores non-enumerable and symbol keys, and an object-literal schema key `__proto__` is silently dropped.
**Fix:** `Object.hasOwn(value, key) ? value[key] : undefined`, and iterate own enumerable keys of the schema.

#### F4 · The TypeScript surface does not match the shipped JavaScript

| Symptom | Evidence |
|---|---|
| `define` declared in `src/index.d.ts:30` but **absent** from the `export {}` list in `src/index.js:131` | `import { define } from 'uvld'` → `SyntaxError: … does not provide an export named 'define'` |
| `unknown` exported at runtime (`index.js:17`) but **not declared** in the `.d.ts` | `error TS2305: Module '"uvld"' has no exported member 'unknown'` |
| `"types": "./index.d.ts"` points to a file that **does not exist** (only `src/index.d.ts` / `dist/index.d.ts`) | Under `moduleResolution: bundler`/`node10`: `TS7016: Could not find a declaration file for module 'uvld'` |
| `exports` map has **no `"types"` condition** | Under `nodenext`, TS finds `dist/index.d.ts` only by accident (via the `main` fallback), not by design |
| `is()` returns `boolean`, not `value is T` | `if (is(string(), x))` gives **no narrowing** → `TS2322` in consumer test |
| `object()` return type adds `& { [key: string]: any }` | `Infer<typeof object({name,age})>` = `{name:string; age:number} & {[key:string]:any}` — arbitrary property access allowed |
| `Validator<T>` declares `value: T` (not `unknown`) | Validators claim their input is already valid; inference is unsound |
| `VError.issues: Issue<unknown>[]` | Runtime can contain `false` or bare objects (F11) — the type is a lie |

**Impact:** TypeScript projects either get `any` everywhere or fail to compile; the README's headline feature "Type Inference" is only partially delivered.

### 6.2 High — wrong results, broken errors, broken installs

#### F5 · `min` / `max` misuse their arguments — `src/index.js:95-98`

```js
const min = (minValue, ...args) =>
  define("min", …)(`Min ${minValue}`, ...args);   // args[0] becomes `validations`, not `message`
```

The second argument is passed into the `validations` slot of `define`, so:
- `min(5, "too short")` on a **passing** value → `TypeError: validations.flatMap is not a function`;
- custom messages are impossible; the message is always `"Min 5"` / `"Max 10"`;
- README (`min(minValue, message = '', validations = [])`) and `.d.ts` both document the wrong contract.

Also `min`/`max` use raw `>=` / `<=` on unknown types: `max(2)` accepts `null` (`null <= 2` is `true`), `min(0)` accepts `true`, and `min(5)` on a `Symbol` throws `TypeError` before any issue is produced.

#### F6 · `safeParse()` is not exception-safe — `src/index.js:123-129`

There is no `try/catch`. Any throw inside a validator escapes:

```js
safeParse(custom(x => x.foo.bar, 'msg'), undefined); // THREW TypeError (not a result object)
safeParse(min(5), Symbol('x'));                     // THREW TypeError
safeParse(instance(42), {});                        // THREW TypeError (bad instanceof RHS)
```

`src/try.ts` (the prototype) does have a `try/catch`, but rethrows everything that isn't `VError` — so neither implementation makes "safe" parse safe. Untrusted input should never be able to crash the caller through a *safe* API.

#### F7 · `exports` key order makes the `require` condition unreachable — `package.json:12-18`

```json
"exports": { "browser": …, "umd": …, "import": …, "default": "./dist/index.es.js", "require": "./dist/index.js" }
```

Node checks conditions in **insertion order**; `"default"` matches every consumer and appears **before** `"require"`. Verified on the packed tarball: `require.resolve('uvld')` → `/node_modules/uvld/dist/index.es.js` (an **ESM** file). It only happens to work on Node 22 because Node ≥22.12 supports `require(esm)`; on **Node 18 — the CI target — this throws `ERR_REQUIRE_ESM`**. Additionally `"module": "./dist/index.js"` points to the CJS bundle, so older bundlers using the `module` field get CommonJS. Direct loading of `main` (`dist/index.js`) under `"type": "module"` fails with `ReferenceError: exports is not defined in ES module scope` (verified).

#### F8 · `optional` / `nullable` throw away all nested diagnostics — `src/index.js:22-23`

They are implemented as `define("optional", v => v === undefined || schema(v).length === 0)`. On failure you get exactly one generic issue:

```js
safeParse(optional(object({a:string(),b:string()})), {a:1,b:2}).error.issues
// [{ message: 'Expected optional, received object', expected:'optional', received:…, path:'', origin:'value' }]
```

Nested `path`/`origin`/`message` are lost, `schema(v)` is called without `path`/`origin`, `message` is unused in the `try.ts` variant, and custom `validations` are never run for `undefined`/`null`. Debugging nested optional objects is impractical.

#### F9 · `transform()` does not transform the output — `src/index.js:105`

```js
const transform = (schema, transformer) => (value) => schema(transformer(value));
safeParse(transform(string(), x => x.toUpperCase()), 'hello') // → { success:true, data:'hello' }
```

Only the *validated copy* is transformed; `parse`/`safeParse` return the original value. The corresponding test is **commented out** (`index.spec.ts:159-163`) because it expected `data: 'HELLO'`. `transform` also drops `path`/`origin` entirely. A real transform requires a validator protocol that returns a value, not just issues.

#### F10 · Issue objects embed the raw input value — `src/index.js:4`

Most failure paths set `received: value` (the tuple-length issue uses `value.length`). Verified: `safeParse(string(), {password:'hunter2'})` puts the whole object (password included) into `error.issues[0].received`. If errors are logged/serialised (typical), **secrets leak**. Zod-style libraries avoid echoing raw input by default.

#### F11 · Issues may not be issues — `src/index.js:5`

`validations.flatMap(...).filter(v => v !== true)` keeps `false`, plain objects, `undefined`, `null`, and strings as "issues". Verified: `any('', [() => false])` produces `issues: [false]` and a `VError` whose `.message` is `""`. `VError.issues` is therefore not reliably `Issue[]`.

### 6.3 Medium — semantics, robustness, observability

| ID | Finding | Evidence / impact |
|---|---|---|
| F12 | **`origin` lost through combinators** | `or`, `and`, `lazy`, `transform`, `array`, `object`, `tuple`, `set`, `map`, and `define`'s nested `validations` call children with `(value, path)` only. Verified: a failing `record` key through `or()` reports `origin:'value'` instead of `'key'`. Only `record`'s direct `keySchema` and `strict`'s extra-key branch set `origin:'key'`. |
| F13 | **Weak primitive checks** | `number()` accepts `NaN` and `Infinity` (`typeof NaN === 'number'`); `integer()` correctly rejects them. `date()` accepts `new Date('nope')` (invalid Date); `promise()` rejects thenables and cross-realm promises; `literal()` uses `===`, so `literal(NaN)` and object literals never match; `literal` reports `expected:'literal'` with no expected value. |
| F14 | **`strict()` is incomplete** | Extra-key detection uses `Object.keys` (ignores symbol + non-enumerable keys — verified `{a:'ok',[Symbol()]:'extra'}` passes) and **returns early**, so declared fields are not validated when an extra key exists → incomplete error list. `object({})` vacuously accepts `Date`, `Map`, `Set`, `Promise` (verified). `object()` on `null` reports the confusing `"Expected object, received object"`. |
| F15 | **Ambiguous paths** | Paths are concatenated strings (`${path}[${i}]`, `${path}${path?'.':''}${key}`) with no escaping; a literal key `"a.b"` collides with nested `a.b`. `map`/`set` use the iteration index, not the actual key. No `code` / `expected value` / `input` metadata on issues; no `format()`/`flatten()` helpers; `VError.message` is just `issues[0]?.message`. |
| F16 | **No cycle/depth protection** | Verified: `const Node = object({id:number(), next: lazy(()=>Node)})` on a self-referential object → `RangeError: Maximum call stack size exceeded` escaping `safeParse`. `lazy()` also re-resolves the schema on every call (no memoisation). `or()` never short-circuits. |
| F17 | **`instance` / `enums` are loosely guarded** | `instance(42)` throws `TypeError` at validation time (no constructor check). `enums('abcd')` accepts `'b'` because strings have `.includes` — verified; `.d.ts` types `validations` as `Validator<T>[]` instead of `Validator<T[number]>[]`. |
| F18 | **Inconsistent call signatures across the API** | Some factories take a single `validations` array (`record`, `map`, `array`, `set`, `object`, `strict`, `tuple`, `custom`); others use rest params (`literal`, `instance`, `enums`, `optional`, `nullable`, `min`, `max`, `custom`). Passing a bare validator as the 3rd arg to `literal(42,'msg',string())` or `custom(fn,'msg',number())` is **type-legal but throws at runtime** (`validations.flatMap is not a function`). README claims a uniform `message, validations` pair for all — false. |
| F19 | **`custom()` produces `expected: ''`** | `define("", validate)` → issues have an empty `expected` field; no issue codes. `custom`'s `validate` receives `unknown` at runtime but is typed `(value: T) => boolean`. |
| F20 | **`nullish()` redundancy & `min/max` coercion** | `v == null || v === undefined` — the second clause is dead. `min`/`max` apply JS numeric coercion to `null`/booleans/objects, giving surprising passes/failures (F5). |
| F21 | **`src/try.ts` is a conflicting dead prototype** | 156 lines, never built/exported/tested. `tsc --strict` → **18 errors**, including `Cannot find name 'UnionToIntersection'` and `Property 'message' does not exist on type 'boolean | Issue<T>'`. It defines a different `Issue` (`type`/`value` instead of `expected`/`received`), a different `VError`, `number()` that (correctly) rejects `NaN`, a type-guard `is`, and a `safeParse` with `try/catch`. Keeping it invites an accidental, breaking migration. |
| F22 | **Stale/inconsistent lockfile & dependency classification** | Lockfile root is `uvalid@1.0.0` while manifest is `uvld@0.0.1`; `lockfileVersion: 2`. `rollup-plugin-bundle-size` (a **build** plugin) sits in `dependencies`, so consumers install 12 legacy transitive packages (`chalk@1.1.3`, `gzip-size@3`, `pretty-bytes@3`, …) — verified with `npm ls --omit=dev` in a clean consumer. |
| F23 | **Dependency advisories** | `npm audit`: 14 advisories — 2 critical, 9 high, 3 moderate — across `vite`, `vitest`, `rollup`, `esbuild`, `postcss`, `minimatch`, `brace-expansion`, `picomatch`, `serialize-javascript`, `nanoid`, `source-map-js`, `tinypool`, etc. All are dev-toolchain or the misclassified plugin; none are in the library's own code, but they affect contributors and CI. |

### 6.4 Low — docs, tooling, hygiene

- **F24 · README defects:** lines 53–60 are a copy-paste duplicate ("Validation with Custom Messages"); the `validations` example `(value) => value.length > 5 || {message: …}` relies on the undocumented `filter(v => v !== true)` behaviour; API reference omits `custom`, `any`, `unknown`, `never`, `nullish`, `define`, `Infer`, `Issue`, `Validator`; `min`/`max` signatures documented incorrectly; `not(schema, message, validations)` documented but the runtime ignores `validations`; README says MIT, package says ISC, no `LICENSE` file; badges link to `bundlejs`/`unpkg` while the README recommends `esm.sh` (the `unpkg` field serves an IIFE global, not a module).
- **F25 · CI gaps:** one Node version (18.x), `actions/checkout@v3` / `setup-node@v3` (outdated), `npm test` = bare `vitest` (watch mode in interactive terminals; CI works only because Vitest auto-detects `CI=true`), no `test:run`/`typecheck`/`lint`/`coverage` scripts, no `npm pack` smoke test, no publish workflow, no `permissions`/`concurrency`, no recorded runs.
- **F26 · No quality tooling:** no `tsconfig.json`, ESLint, Prettier, JSDoc, coverage thresholds, or editor config. `index.spec.ts` itself has 2 `tsc --strict` errors (TS7022/TS7024 on the recursive `Node` schema) that CI never sees. `rollup.config.js` instantiates `bundleSize()` and `copy()` for each of 4 outputs (copy runs 4×), emits no sourcemaps, and has a commented-out alternative `transform` line at `src/index.js:106`.
- **F27 · Metadata:** `keywords: []`, `description: "validator"`, no `engines`, no `sideEffects: false`, no `funding`, no git tag matching the published `0.0.1`, no changelog.

---

## 7. Documentation ↔ types ↔ runtime mismatch matrix

| Function | README | `src/index.d.ts` | Actual runtime | Status |
|---|---|---|---|---|
| `string/number/…` | `(message, validations[])` | `(message?, validations?)` | `(message?, validations[])` | ✅ roughly consistent |
| `min/max` | `(minValue, message, validations[])` | `(minValue, message?, validations?)` | `(minValue, …args)` → 2nd arg = `validations` | ❌ throws on valid input |
| `literal` | `(v, message, validations[])` | `(v, message?, ...validations)` | `(v, …args)` → `define(v)(...args)`, 3rd arg must be **array** | ❌ type-legal calls throw |
| `instance/enums` | `(ref/values, message, validations[])` | rest `...validations` | 3rd arg must be **array** | ❌ same |
| `optional/nullable` | `(schema, message, validations[])` | rest `...validations` | 3rd arg must be **array**; `message` works | ⚠️ divergent |
| `custom` | `(validate, message)` | `(validate, message?, validations?)` | `(validate, message, ...validations)`; 3rd arg must be **array** | ⚠️ divergent |
| `record/map/array/set/object/strict/tuple` | `(…, message, validations[])` | array | array | ✅ consistent |
| `not` | `(schema, message, validations[])` | `(schema, message?)` | `(schema, message)` — ignores validations | ⚠️ README overstates |
| `transform` | "Transforms the value before validation" | `(schema, transformer) => Validator<U>` | transforms only the validated copy; **output unchanged** | ❌ misleading |
| `is` | returns `true`/`false` | `: boolean` | boolean (no TS narrowing) | ⚠️ missed feature |
| `define` | undocumented | **declared & exported** | **not exported** | ❌ runtime `SyntaxError` |
| `unknown` | undocumented | **not declared** | exported | ❌ `TS2305` |
| `Infer` / `Issue` / `Validator` | `Infer` mentioned, others undocumented | declared | different shapes in `try.ts` | ⚠️ |

---

## 8. Packaging deep dive (verified on the published tarball)

A clean consumer project installed `uvld-0.0.1.tgz`, then:

| Consumer action | Observed |
|---|---|
| `import * as v from 'uvld'` (ESM) | ✅ 37 exports, validators work |
| `require('uvld')` (Node 22) | ⚠️ `require.resolve` → `dist/index.es.js` (ESM); works only via Node ≥22.12 `require(esm)` |
| `require('uvld')` (Node 18 — CI target) | ❌ would be `ERR_REQUIRE_ESM` |
| `tsc --moduleResolution bundler` | ❌ `TS7016: Could not find a declaration file for module 'uvld'` |
| `tsc --moduleResolution node10` | ❌ `TS7016` |
| `tsc --module nodenext` | ⚠️ finds `dist/index.d.ts` only via `main` fallback; `unknown` missing (TS2305); CJS→ESM import error TS1479 in CJS projects |
| `import { define } from 'uvld'` | ❌ `SyntaxError: does not provide an export named 'define'` |
| `import('./dist/index.js')` | ❌ `ReferenceError: exports is not defined in ES module scope` |

**Root causes:** (a) `types` points at `./index.d.ts`, a file that is neither in the repo nor in the `files` allowlist; (b) no `types` condition in `exports`; (c) `default` before `require`; (d) CJS emitted as `.js` inside a `"type": "module"` package; (e) `module` field points to the CJS file.

**Suggested manifest (with matching Rollup output names):**

```json
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "devDependencies": { "rollup-plugin-bundle-size": "^1.0.3", "...": "..." }
}
```

Rollup should emit `index.js` (ESM) and `index.cjs` (CJS), keep `index.min.js`/`index.umd.js` for CDN, and copy `index.d.ts`. Add a `prepack` script and a consumer smoke test (`node -e "require('uvld')"` + `tsc --noEmit`) in CI.

---

## 9. Test & CI assessment

**What works:** `npx vitest run` → 26/26 tests, 273 ms; one test file imports 36 of 37 runtime exports (only `unknown` is missing) and exercises primitives, wrappers, composites, combinators, `parse`/`safeParse`, `lazy`, `not`, `strict`, and a large nested object.

**What's missing / misleading:**

1. **The "Complex" test is vacuous for records.** Its `record(symbol(), …)` fields use symbol keys (`index.spec.ts:303, 337`), which `Object.entries` skips — so `record`, symbol keys, and the nested `map` are never actually validated. This is the single most misleading test.
2. **Assertions are shallow.** Most failures use `expect.any(VError)`; only the `strict` test checks issue contents. No assertions on `path`, `origin`, `expected`, `received`, custom messages, or `VError.message`.
3. **No negative/edge tests:** `NaN`/`Infinity`, invalid `Date`, thenables, `null` under `object`, `min/max` standalone with custom messages, symbol keys, `or` with multi-issue branches, cycles, thrown validators, `unknown`/`define` exports, package exports/type resolution.
4. **`transform` is untested** — its only test is commented out (lines 159–163) because it fails.
5. **No type checking in CI.** `index.spec.ts` has 2 strict-TS errors; `src/try.ts` has 18. Vitest uses esbuild (no typecheck), so these never surface.
6. **No coverage measurement or thresholds**, no lint, no build-artifact verification, no `npm pack` validation, no publish workflow, and no recorded runs of the existing workflow.

**Recommended minimum test additions (each maps to a finding):** F1 multi-issue `or`; F2 symbol-keyed record; F3 inherited-property bypass; F5 `min(5,'msg')` on a passing value; F6 throwing `custom`; F9 `transform` output; F10 issue redaction; F13 `NaN`/invalid `Date`; F14 strict with symbol extra key; F16 cyclic input; F4/F7 consumer smoke test for ESM/CJS/TS.

---

## 10. Security & robustness posture

| Concern | Status | Detail |
|---|---|---|
| Validation bypass | ❌ | F1 (`or`), F2 (`record`), F3 (prototype chain), F14 (`strict` symbol keys) |
| Denial of service | ❌ | Cyclic/deep input → uncaught `RangeError` (F16); throwing validators escape `safeParse` (F6) |
| Sensitive data exposure | ⚠️ | Raw input embedded in every issue (F10) |
| Untrusted-schema execution | ⚠️ | `custom`/`validations` are arbitrary user code — expected, but `instance`/`enums` also throw on malformed schema args (F17) |
| Prototype pollution *by* the library | ✅ | No writes to input objects; `parse` returns the original reference (no clone) |
| Dependency supply chain | ⚠️ | 14 advisories (2 critical / 9 high / 3 moderate); a build-only plugin shipped as a runtime dep pulling 12 legacy packages (F22/F23) |
| Async validation | ➖ | Not supported; `promise()` only checks `instanceof Promise`, never awaits |

Note: `parse()` returning the original (uncloned) reference means callers can mutate a "validated" object afterwards; there is no immutability guarantee.

---

## 11. Positioning vs. the ecosystem

| Capability | `uvld@0.0.1` | Zod / Valibot / ArkType |
|---|---|---|
| Bundle size | **~1.7 kB gz, 0 runtime deps** | 5–15 kB gz (Valibot is closest, modular) |
| Primitives / composites | Broad for 168 lines | Broader, better-specified |
| Error model | Flat issue array, string paths, no codes, raw values | Structured issues, codes, path arrays, formatting helpers |
| Transforms / coercion / defaults | ❌ (F9) | ✅ |
| Async validation / refinements | ❌ | ✅ |
| Type inference | Partial (F4) | Primary feature, sound |
| Recursive schemas | `lazy()` (works, no cycle guard) | ✅ with cycle-safe patterns |
| Maintenance | 1 commit, 2 years stale, 1 npm version | Active |
| Tests / typecheck / CI | Shallow / none / minimal | Extensive |

**Honest positioning:** `uvld` is a neat educational implementation of the validator-factory pattern and a legitimately small bundle. Its size advantage is real, but correctness gaps make it unsuitable as a drop-in Zod alternative today. Either invest in the P0 pass below (and own the fork), or use a maintained library.

---

## 12. Prioritised remediation roadmap

### P0 — correctness (do before any use)

1. **Rewrite `or()`** to test each branch's own result (F1) and short-circuit on first success.
2. **Fix `record()`** to enumerate symbol keys, and **fix `object()`/`strict()`** to use `Object.hasOwn` (F2, F3). Update the "Complex" test so it actually validates those fields — it should then fail, capturing the regression.
3. **Normalise the issue protocol** (F11): every validator returns `Issue[]`; convert boolean/object returns from custom validations into proper issues with `message`, `expected`, `received`, `path`, `origin`, and a `code`. Drop `.filter(v => v !== true)`.
4. **Fix `min`/`max`** signatures to `(bound, message = \`Min ${bound}\`, validations = [])`, guard non-numeric/non-sized inputs, and stop raw coercion (F5, F20).
5. **Make `safeParse` genuinely safe** (F6): wrap evaluation in `try/catch`, convert unexpected throws into a `VError` (with code `validator_threw`), and add a depth/cycle guard (`WeakSet` of visited objects) (F16).
6. **Preserve nested issues** in `optional`/`nullable` (F8) — return the child's issues instead of a generic one; pass `path`/`origin` through.
7. **Decide `transform`'s contract** (F9): either rename to `preprocess`/`precheck` and document it, or change the validator protocol to return a value and implement real transforms + a test.

### P1 — packaging & types (do before publishing 0.0.2)

8. Fix `exports` order + `types` condition, emit `.cjs`, correct `module`/`main`, add `sideEffects: false`, move the bundle-size plugin to `devDependencies`, regenerate the lockfile with the correct name/version (§8, F7, F22).
9. Regenerate `src/index.d.ts` **from the JS exports** (or convert the source to TypeScript and emit declarations). Harmonise `define`/`unknown`, make `is` a type predicate, remove the `object()` index signature, type `Validator<T>` input as `unknown`, and type `VError.issues` accurately (F4).
10. Delete or complete `src/try.ts` (F21). If it is the intended future, port its better ideas (`number()` rejecting `NaN`, type-guard `is`, `try/catch`) into `src/index.js` and remove the duplicate.
11. Add a `typecheck` script (`tsc --noEmit`) and a consumer smoke test to CI (F25).

### P2 — quality, docs, hygiene

12. Harden primitives: `number()` → `Number.isFinite`; `date()` → `!isNaN(value.getTime())`; `promise()` → thenable check; `literal`/`enums` → `Object.is`/SameValueZero; `instance` → validate the constructor (F13, F17).
13. Propagate a real context object (`{path, origin, …}`) through every combinator; use array paths; add issue codes and `VError.format()` (F12, F15).
14. Redact `received` by default (or make it opt-in) to avoid leaking secrets (F10).
15. Rewrite the README: remove the duplicate section, generate the API table from the type declarations, document uniform `(message, validations[])` signatures, and reconcile the license (add a `LICENSE` file matching `package.json`) (F24).
16. Upgrade CI: current actions, Node 18/20/22 matrix, `vitest run --coverage`, `tsc --noEmit`, `npm pack --dry-run`, `npm audit`, and a tag-based publish workflow (F23, F25).
17. Add `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `tsconfig.json`, lint/format config, and a git tag for `0.0.1` (F27).
18. Expand the test suite with the cases listed in §9 and enforce a coverage threshold.

**Acceptance criteria for a "production-ready" claim:** all P0 + P1 items done; 26+ tests passing with ≥90% line coverage; `tsc --noEmit --strict` clean on spec + source; clean ESM/CJS/TS consumer smoke tests on Node 18, 20, and 22; zero critical/high `npm audit` findings; no known false-positive validation paths.

---

## 13. Appendix — reproduce this analysis

```bash
# Repo state
git log --oneline --decorate -5 ; git ls-files ; git status --short

# Install / build / test
npm ci --no-audit --no-fund
npm run build
npx vitest run --reporter=verbose
npm pack --dry-run --json
npm audit --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).metadata.vulnerabilities))"

# Typecheck (TypeScript installed separately; no tsconfig in repo)
npx tsc --noEmit --strict --skipLibCheck --target es2022 \
    --module esnext --moduleResolution bundler index.spec.ts
npx tsc --noEmit --strict --target es2022 --module esnext \
    --moduleResolution bundler src/try.ts

# Consumer smoke test
npm pack --pack-destination /tmp
mkdir -p /tmp/consumer && cd /tmp/consumer && npm init -y
npm i /tmp/uvld-0.0.1.tgz typescript@5
node --input-type=module -e "import * as v from 'uvld'; console.log(Object.keys(v).length)"
node -e "console.log(require.resolve('uvld'))"
./node_modules/.bin/tsc --noEmit --strict --module esnext --moduleResolution bundler consumer.ts
```

### Minimal black-box reproduction of the top five defects

```js
import * as v from './src/index.js';

// F1  or() accepts invalid data
console.log(v.safeParse(v.or(v.array(v.string()), v.number()), [1,2,3]).success); // true (WRONG)

// F2  record() skips symbol keys
console.log(v.safeParse(v.record(v.symbol(), v.map(v.string(), v.string())),
                        { [Symbol('k')]: 'not a map' }).success);               // true (WRONG)

// F3  object() reads inherited keys
Object.prototype.isAdmin = false;
console.log(v.safeParse(v.object({ isAdmin: v.custom(x => x === false, 'x') }), {}).success); // true (WRONG)
delete Object.prototype.isAdmin;

// F5  min() with a custom message throws on a valid value
try { v.safeParse(v.min(5, 'too short'), 'hello'); } catch (e) { console.log(e.message); }
// "validations.flatMap is not a function"

// F6  safeParse() throws instead of returning a result
try { v.safeParse(v.custom(x => x.foo.bar, 'bad'), undefined); } catch (e) { console.log(e.constructor.name); }
// "TypeError"
```

---

*End of analysis.*
