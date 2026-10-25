# UVld — tiny schema validation

[![tests](https://github.com/kethan/uvld/actions/workflows/node.js.yml/badge.svg)](https://github.com/kethan/uvld/actions/workflows/node.js.yml) [![Version](https://img.shields.io/npm/v/uvld.svg?color=success&style=flat-square)](https://www.npmjs.com/package/uvld) [![size](https://deno.bundlejs.com/badge?q=uvld&treeshake=[*]&config={"compression":"brotli"})](https://bundlejs.com/?q=uvld)

**uvld** validates unknown data in JavaScript and TypeScript: one small function per type, composed into schemas, with structured errors and static type inference.

- **Zero runtime dependencies.** 38 core exports (~4.3 kB minified / ~1.9 kB gzip) plus **158 opt-in utilities** in `uvld/utils`, which never add a byte to the core.
- **Correct by default.** Finite numbers, own properties, symbol keys, safe unions, exception-safe parsing.
- **TypeScript-first.** `Infer<typeof schema>`, a real `is()` type guard, declarations shipped with the package.
- **Uniform API.** Every validator factory takes `(message?, validations?)`.

> Requires Node >= 20 (or any modern browser). ESM, CommonJS and a `<script>` build are all shipped.

---

## Quickstart

```bash
npm i uvld        # or: yarn add uvld / pnpm add uvld
```

```js
import { object, string, number, is, parse, safeParse } from 'uvld';

const User = object({ name: string(), age: number() });

is(User, { name: 'Ada', age: 36 });            // true
const user = parse(User, { name: 'Ada', age: 36 }); // { name: 'Ada', age: 36 }

const result = safeParse(User, { name: 'Ada', age: '36' });
if (!result.success) {
  console.log(result.error.message);            // "Expected number, got string"
  console.log(result.error.issues[0].path);     // '["age"]'
}
```

`parse` throws a `VError`; `safeParse` returns `{ success: true, data }` or `{ success: false, error }`; `is` returns a boolean (and narrows in TypeScript).

---

## Core concepts

A **validator** is a function `(value, context?) => Issue[]`. An empty array means valid. Schemas compose because every factory returns a validator.

```js
import { string, min, max, custom, object, array } from 'uvld';

const password = string('Password required', [
  min(8, 'At least 8 characters'),
  max(72, 'Too long'),
  v => /[0-9]/.test(v) || 'Add a number'
]);

const Signup = object({ email: string(), password, tags: array(string()) }, 'Invalid signup', [
  form => form.tags.length < 5 || 'At most 5 tags'
]);
```

The **uniform signature** is `factory(..., message?: string, validations?: Validator[])`:

- `message` replaces the default error text when the type check fails.
- `validations` is an array of extra validators/refinements. A refinement may return `true`, `false`, a message string, a partial `Issue`, or an `Issue[]`. Anything else is normalised into a proper issue.
- `custom(predicate, message?, validations?)` and `define(type, predicate)` let you add your own validators with the same shape.

```js
import { custom, define } from 'uvld';

const even = custom(v => v % 2 === 0, 'Must be even');
const uuid = define('uuid', v => typeof v === 'string' && v.length === 36);
const id = uuid('Not a UUID');
```

---

## API reference

### Primitives

| Export | Validates |
| --- | --- |
| `string` | `typeof === 'string'` |
| `number` | finite number (rejects `NaN`, `Infinity`, `-Infinity`) |
| `boolean` | `typeof === 'boolean'` |
| `bigint` | `typeof === 'bigint'` |
| `symbol` | `typeof === 'symbol'` |
| `func` | `typeof === 'function'` |
| `integer` | `Number.isInteger` |
| `date` | a valid `Date` (invalid dates rejected) |
| `promise` | a `Promise` or any thenable |
| `nullish` | `null` or `undefined` |
| `any` | anything |
| `unknown` | anything (typed as `unknown`) |
| `never` | nothing (always fails) |

### Literals, classes, enums

| Export | Description |
| --- | --- |
| `literal(value, message?, validations?)` | strict identity via `Object.is` — `literal(NaN)` works |
| `instance(Class, message?, validations?)` | `instanceof`; throws `TypeError` for a non-class argument |
| `enums(values, message?, validations?)` | membership via `Array.includes` (SameValueZero, so `NaN` works); requires an array |

### Wrappers

| Export | Description |
| --- | --- |
| `optional(schema, message?, validations?)` | accepts `undefined`; otherwise delegates and **keeps** nested issues |
| `nullable(schema, message?, validations?)` | accepts `null`; otherwise delegates and keeps nested issues |
| `custom(predicate, message?, validations?)` | arbitrary validation logic |
| `define(type, predicate)` | returns a validator factory with the same `(message?, validations?)` signature |

### Composites

| Export | Description |
| --- | --- |
| `object(shape, message?, validations?, exact?)` | plain objects, **own** properties only; extra keys allowed by default |
| `strict(shape, message?, validations?)` | `object(..., exact = true)` — reports unknown keys (including symbols) *and* field errors |
| `array(schema, message?, validations?)` | arrays; paths use `[index]` |
| `tuple(schemas, message?, validations?)` | fixed-length arrays with per-position schemas |
| `record(keySchema, valueSchema, message?, validations?)` | dictionaries; validates **string and symbol** keys and values |
| `map(keySchema, valueSchema, message?, validations?)` | `Map` entries (key/value schemas) |
| `set(schema, message?, validations?)` | `Set` members |

### Constraints and combinators

| Export | Description |
| --- | --- |
| `min(bound, message?, validations?)` | number >= bound, or `length`/`size` >= bound for string/array/`Map`/`Set` |
| `max(bound, message?, validations?)` | number <= bound, or `length`/`size` <= bound |
| `or(...schemas)` | passes if **any** branch passes; short-circuits; aggregates all issues when all fail |
| `and(...schemas)` | passes only if every schema passes; collects all issues |
| `not(schema, message?, validations?)` | inverts a schema |
| `lazy(() => schema)` | deferred/recursive schemas; resolved once |
| `transform(schema, fn)` | validates `fn(value)`; at the root, `parse`/`safeParse` return `fn(value)` (applied once) |

### Entry points and errors

| Export | Description |
| --- | --- |
| `is(schema, value)` | `boolean`; TypeScript type guard `value is T`; never throws |
| `parse(schema, value)` | returns the value, or throws `VError` |
| `safeParse(schema, value)` | `{ success: true, data }` or `{ success: false, error: VError }`; never throws |
| `VError` | `Error` subclass with `issues: Issue[]` |

Exported types: `Issue`, `Context`, `Origin`, `Validator`, `Refinement`, `RefinementResult`, `ValidationResult`, `Infer`, `InferShape`, `UnionToIntersection`, `ValidatorFactory`, `SafeParseReturn`.

---

## Error handling

Every failure produces a well-formed issue:

```js
{
  message: 'Expected number, got string',
  expected: 'number',        // what the schema wanted
  received: 'string',        // a type tag — never the raw value, so secrets stay out of logs
  path: '["user"]["tags"][1]',
  origin: 'value'            // 'value' for data, 'key' for record/map keys
}
```

- Paths are unambiguous bracket segments: `["a.b"][0]` cannot be confused with `["a"]["b"]`.
- The root path is `""`.
- `VError.message` is the first issue's message; `VError.issues` holds all of them.
- Unexpected exceptions inside user validators are converted into an issue (`Threw: ...`), so `safeParse` never crashes your process.

```js
import { VError, parse, string } from 'uvld';

try {
  parse(string(), 42);
} catch (err) {
  if (err instanceof VError) console.table(err.issues);
}
```

---

## TypeScript

Declarations ship inside the package; no `@types/...` install needed.

```ts
import { object, string, number, array, optional, or, parse, safeParse, is, type Infer } from 'uvld';

const User = object({
  name: string(),
  age: number(),
  tags: array(string()),
  bio: optional(string())
});

type User = Infer<typeof User>;
// { name: string; age: number; tags: string[]; bio: string | undefined }

const Id = or(string(), number());
type Id = Infer<typeof Id>; // string | number

let value: unknown = 'hello';
if (is(string(), value)) {
  value.toUpperCase(); // value is narrowed to string
}

const result = safeParse(User, data);
if (!result.success) {
  result.error.issues[0].path; // string
}
```

`Infer` also works for `tuple`, `literal`, `enums`, `instance`, `record`, `map`, `set`, `and` and `transform`. See [`examples/typescript.ts`](examples/typescript.ts) and the checked type tests in [`tests/types.check.ts`](tests/types.check.ts).

---

## Use cases

Runnable, assert-based examples live in [`examples/`](examples/). Run them all with `npm run examples`.

| Example | What it shows |
| --- | --- |
| [`quickstart.mjs`](examples/quickstart.mjs) | `is` / `parse` / `safeParse`, first schema |
| [`forms.mjs`](examples/forms.mjs) | sign-up form: friendly messages, refinements, cross-field rules |
| [`api.mjs`](examples/api.mjs) | API payloads: nested `strict` objects, enums, arrays, tuples, unions |
| [`custom.mjs`](examples/custom.mjs) | `define`, `custom`, `and`, `or`, `not`, slug validation |
| [`recursive.mjs`](examples/recursive.mjs) | `lazy` trees, nested error paths, circular input |
| [`errors.mjs`](examples/errors.mjs) | issue shape, `VError`, trapped validator exceptions |
| [`transform.mjs`](examples/transform.mjs) | trimming/coercion with `transform` |
| [`records.mjs`](examples/records.mjs) | records, symbol keys, `Map`, `Set`, nested arrays |
| [`utils.mjs`](examples/utils.mjs) | `uvld/utils`: format checks, constraints, transforms, `pipe` |
| [`typescript.ts`](examples/typescript.ts) | static inference (compile-only) |

A few compact recipes:

```js
// Config with defaults enforced at the boundary
const Config = object({ host: string(), port: number('port must be a number', [min(1), max(65535)]) });

// Recursive tree
const Node = object({ id: number(), children: array(lazy(() => Node)) });

// Unions that actually work with multi-error branches
const Payload = or(object({ kind: literal('a'), a: string() }), object({ kind: literal('b'), b: number() }));

// Reject unknown keys (including symbols)
const Body = strict({ token: string(), amount: number() });
```

---

## Utilities — `uvld/utils`

The core stays tiny. All of the extra validators, constraints, transforms and
helpers live in a **separate, opt-in entry point**, so importing them never adds
a byte to the core `uvld` bundle. Use `uvld/utils` when you need them; a bundler
tree-shakes everything you do not import.

```bash
npm i uvld
```

```js
import { string, number, object, safeParse, parse } from 'uvld';
import { email, minLength, uuid, ipv4, trim, pipe, toLowerCase } from 'uvld/utils';

// Checks drop straight into a core `validations` array …
const Email = string('Expected text', [email('Invalid email'), minLength(6)]);
safeParse(Email, 'ada@example.com'); // { success: true, data: 'ada@example.com' }

// … and also work standalone.
uuid()('550e8400-e29b-41d4-a716-446655440000'); // true

// `pipe` composes transform actions + checks and returns transformed data.
const CleanEmail = pipe(string(), trim(), toLowerCase(), email());
parse(CleanEmail, '  ADA@Example.COM  '); // 'ada@example.com'
```

### Two kinds of utility

- **Checks** — `check(value) => true | message`. Usable standalone, inside a
  core `validations` array, or in `pipe`. Formats (`email`, `uuid`, `ipv4`,
  `creditCard`, `isoTimestamp`, …), constraints (`minLength`, `maxBytes`,
  `minValue`, `multipleOf`, …) and generic helpers (`check`, `rawCheck`,
  `guard`, `regex`, `includes`, `everyItem`, …) are checks.
- **Transform actions** — `action(value) => newValue`, tagged for `pipe`.
  `trim`, `toLowerCase`, `toCamelCase`, `toNumber`, `parseJson`, `mapItems`,
  `rawTransform`, … are transform actions. Use them with `pipe(schema, ...)`
  or with core `transform(schema, action)`, not as standalone schemas.

`pipe(schema, ...actions)` applies transforms once, validates the result
against `schema`, runs the checks, and (at the root of `parse`/`safeParse`)
returns the transformed data. Nested pipes validate but do not rewrite the
parent object — normalise fields before calling `parse` if you need that.

### Complete utility list

<details>
<summary>All   alpha alphaNumeric args ascii base64 bic brand bytes
  check checkItems codePoints compactItems creditCard cuid2 decimal description
  digits domain email emoji empty endsWith entries everyItem
  examples excludes fallback filterItems findItem finite flatten flavor
  graphemes gtValue guard hash hexColor hexadecimal imei inRange
  includes integer ip ipv4 ipv6 isbn isoDate isoDateTime
  isoDateTimeSecond isoTime isoTimeSecond isoTimestamp isoWeek isrc json jwsCompact
  ksuid length lowercase ltValue mac mac48 mac64 mapItems
  maxBytes maxCodePoints maxDate maxEntries maxGraphemes maxLength maxSize maxValue
  maxWords message metadata mimeType minBytes minCodePoints minDate minEntries
  minGraphemes minLength minSize minValue minWords multipleOf nanoid negative
  nonEmpty nonNegative nonNullable nonNullish nonOptional nonPositive normalize notBytes
  notCodePoints notEntries notGraphemes notLength notSize notValue notValues notWords
  octal padEnd padStart parseBoolean parseJson partialCheck pipe positive
  rawCheck rawTransform readonly reduceItems regex replace returns reverseItems
  rfcEmail safeInteger semver size slug someItem sortItems startsWith
  stringifyJson title toBigint toBoolean toCamelCase toDate toKebabCase toLowerCase
  toMaxValue toMinValue toNumber toPascalCase toSnakeCase toString toTitleCase toUnique
  toUpperCase transform trim trimEnd trimStart truncate ulid uniqueItems
  uppercase url uuid value values words
```

</details>

Grouped by purpose:

- **Formats / identifiers:** `base64`, `bic`, `creditCard`, `cuid2`, `decimal`,
  `digits`, `domain`, `email`, `rfcEmail`, `emoji`, `hexadecimal`, `hexColor`,
  `imei`, `ip`, `ipv4`, `ipv6`, `isbn`, `isrc`, `isoDate`, `isoDateTime`,
  `isoDateTimeSecond`, `isoTime`, `isoTimeSecond`, `isoTimestamp`, `isoWeek`,
  `jwsCompact`, `ksuid`, `mac`, `mac48`, `mac64`, `mimeType`, `nanoid`,
  `octal`, `slug`, `ulid`, `url`, `uuid`, `hash`, `alpha`, `alphaNumeric`,
  `lowercase`, `uppercase`, `ascii`, `semver`, `json`.
- **Size / count / value constraints:** `length`, `minLength`, `maxLength`,
  `notLength`, `bytes`, `minBytes`, `maxBytes`, `notBytes`, `codePoints`,
  `minCodePoints`, `maxCodePoints`, `notCodePoints`, `graphemes`,
  `minGraphemes`, `maxGraphemes`, `notGraphemes`, `words`, `minWords`,
  `maxWords`, `notWords`, `size`, `minSize`, `maxSize`, `notSize`, `entries`,
  `minEntries`, `maxEntries`, `notEntries`, `minValue`, `maxValue`, `gtValue`,
  `ltValue`, `value`, `notValue`, `notValues`, `values`, `multipleOf`,
  `positive`, `negative`, `nonNegative`, `nonPositive`, `inRange`, `minDate`,
  `maxDate`.
- **Number / emptiness / membership:** `finite`, `integer`, `safeInteger`,
  `empty`, `nonEmpty`, `includes`, `excludes`, `startsWith`, `endsWith`,
  `regex`, `check`, `rawCheck`, `partialCheck`, `guard`, `everyItem`,
  `someItem`, `checkItems`, `uniqueItems`, `toUnique`, `compactItems`,
  `reverseItems`.
- **Transforms:** `trim`, `trimStart`, `trimEnd`, `toLowerCase`, `toUpperCase`,
  `toCamelCase`, `toPascalCase`, `toKebabCase`, `toSnakeCase`, `normalize`,
  `toNumber`, `toBoolean`, `parseBoolean`, `toBigint`, `toDate`, `toString`,
  `toMinValue`, `toMaxValue`, `parseJson`, `stringifyJson`, `mapItems`,
  `filterItems`, `sortItems`, `reduceItems`, `findItem`, `toTitleCase`,
  `truncate`, `padStart`, `padEnd`, `replace`, `rawTransform`,
  `transform` (re-export of core `transform`).
- **Composition / metadata / errors:** `pipe`, `args`, `returns`, `readonly`,
  `title`, `description`, `metadata`, `examples`, `brand`, `flavor`, `fallback`,
  `message`, `nonNullable`, `nonOptional`, `nonNullish`, `flatten`.

Production additions beyond the original list: `fallback` (default on
failure), `message` (override issue text), `flatten` (path → messages map for
forms/APIs), `nonNullable`/`nonOptional`/`nonNullish`, `alpha`,
`alphaNumeric`, `lowercase`, `uppercase`, `ascii`, `semver`, `json`,
`positive`/`negative`/`nonNegative`/`nonPositive`, `inRange`, `minDate`/
`maxDate`, `uniqueItems`, `toUnique`, `compactItems`, `reverseItems`,
`toTitleCase`, `truncate`, `padStart`, `padEnd`, `replace`.

Notes: `hash(algorithm)` checks hex digests for md5/sha1/sha256/sha384/sha512;
`nanoid(size)` defaults to 21; `creditCard`, `imei` and `isbn` verify checksums;
`graphemes` uses `Intl.Segmenter` when available; `bytes` uses UTF-8.
`title`/`description`/`metadata`/`examples`/`brand`/`flavor` decorate a schema
(`title(schema, 'Name')`) or act as metadata inside `pipe`.

See [`examples/utils.mjs`](examples/utils.mjs) and
[`tests/utils.spec.ts`](tests/utils.spec.ts) (99 tests) for runnable coverage.

---

## Browser / CDN

```html
<script src="https://unpkg.com/uvld/dist/index.min.js"></script>
<script>
  const { string, safeParse } = uvld;
  console.log(safeParse(string(), 'hi'));
</script>
```

Or use an ESM CDN: `https://esm.sh/uvld`. CommonJS works too: `const { string } = require('uvld');`. The `uvld/utils` entry point ships as ESM + CJS (no IIFE build) and works with `node16`/`nodenext`, `bundler` and legacy `node10` TypeScript resolution.

---

## Size & performance

All shipped bundles are minified. `npm run size` enforces the budget in CI.

| Bundle | Raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| `dist/index.js` (ESM) | 4,315 B | 1,895 B | 1,756 B |
| `dist/index.cjs` (CJS) | 4,422 B | 1,830 B | 1,687 B |
| `dist/index.min.js` (IIFE) | 4,229 B | 1,818 B | 1,677 B |
| `dist/utils.js` (ESM, opt-in) | 13,608 B | 5,073 B | 4,600 B |
| `dist/utils.cjs` (CJS, opt-in) | 14,033 B | 4,916 B | 4,431 B |

`uvld/utils` is a **separate entry point**: `dist/utils.js` imports the core as
an external module (never duplicates it), so the core bundle above is
byte-identical whether or not you use utilities. Bundlers tree-shake the named
ESM exports, so you only pay for what you import.

- Raw ESM bytes are **33% lower** than 0.0.1 (6,422 B unminified); there are **no runtime dependencies** (0.0.1 shipped a build plugin as a runtime dep, pulling 12 legacy packages into consumer installs), and the published tarball is smaller.
- Compressed full-bundle size is slightly larger than the 0.0.1 minified CDN build (~1.27 kB gzip) because 1.0.0 fixes ~20 correctness defects, adds symbol-key/own-property handling, context propagation, exception safety and path encoding. The budget above stops it growing further.
- Bundlers can tree-shake the ESM build — import only what you use. Validation is synchronous and allocation-light; no regexes, no async, no schema compilation step.
- A depth guard (64 levels) prevents stack overflows on circular data.

---

## Migration from 0.0.1

1.0.0 is intentionally a breaking release. See [`CHANGELOG.md`](CHANGELOG.md) for the full list. The pre-1.0.0 audit that motivated these changes is preserved in [`ANALYSIS.md`](ANALYSIS.md).

| 0.0.1 | 1.0.0 |
| --- | --- |
| `literal(1, 'msg', validator)` | `literal(1, 'msg', [validator])` — uniform `validations` array |
| `min(5, 'msg')` threw on valid input | `min(5, 'msg')` works; signature is `(bound, message?, validations?)` |
| `err.issues[0].received` = raw value | `received` = type tag string |
| `err.issues[0].path = 'a.b'` | `path = '["a"]["b"]'` |
| `Expected string, received number` | `Expected string, got number` |
| `require('uvld')` resolved to an ESM file | resolves to `dist/index.cjs` |
| `object({})` accepted `Date`/`Map`/`Set` | rejects non-plain objects |
| `number()` accepted `NaN` | rejects non-finite numbers |
| `transform()` never changed the output | root transforms return transformed data |
| `define` typed but missing; `unknown` exported but untyped | both aligned |

---

## Development

```bash
npm ci
npm test             # vitest run (158 tests)
npm run typecheck    # tsc --noEmit over source types, tests and examples
npm run examples     # run all 9 runnable examples
npm run build        # ESM + CJS + IIFE bundles and dist/index.d.ts
npm run size         # enforce the byte budget
npm run smoke        # pack + install into a clean consumer; ESM/CJS/TS/IIFE checks
npm run check        # all of the above in order
```

CI runs on Node 20 and 22 and also performs `npm audit --audit-level=moderate` (currently 0 advisories). See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution checklist and [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## License

[ISC](LICENSE) © Kethan Surana. (0.0.1's README said MIT while the manifest said ISC; 1.0.0 ships a real `LICENSE` file matching the manifest.)
