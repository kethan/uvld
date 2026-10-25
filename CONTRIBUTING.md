# Contributing

Thanks for helping out. The core is one file: [`src/index.js`](src/index.js), with public
types in [`src/index.d.ts`](src/index.d.ts). Optional utilities live in
[`src/utils.js`](src/utils.js) / [`src/utils.d.ts`](src/utils.d.ts) and are built as a
separate entry point. Both surfaces are kept in sync by [`tests/api.spec.ts`](tests/api.spec.ts).

## Setup

```bash
npm ci
npm run check        # typecheck + tests + examples + build + size + smoke
```

Use `npm run test:watch` while developing.

## Rules

1. **Every behavioural change needs a test.** Prefer a regression test that fails
   on the old behaviour (see `index.spec.ts` for the 1.0.0 regressions).
2. **Keep the API surface in sync.** Adding/removing an export means updating
   `src/index.js` / `src/utils.js`, the matching `.d.ts`, `README.md` and the
   smoke-test export counts. Utilities must not add bytes to the core bundle —
   `npm run size` enforces this.
3. **Respect the byte budget.** `npm run size` fails if a bundle grows past its
   limit. Prefer reusing helpers over adding new code paths.
4. **Uniform signatures.** New validator factories must accept
   `(message?: string, validations?: Validator[])`.
5. **No runtime dependencies.** Tooling belongs in `devDependencies`.
6. **Errors never contain raw input.** Issues carry a `received` type tag only.
7. Run `npm run examples` — examples are assert-based and double as smoke tests.

## Releasing

1. Update `CHANGELOG.md`, bump `version` in `package.json` (and regenerate
   `package-lock.json` with `npm install --package-lock-only`), and tag the release.
2. `npm run check && npm audit --audit-level=moderate`.
3. `npm publish` (the `prepack` script rebuilds `dist/` automatically).
