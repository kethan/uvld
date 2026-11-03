// Bundle-size benchmark: what a consumer actually ships for a given import.
//
// Each case is a tiny generated entry file, bundled with esbuild exactly like
// bundlejs.com does it (bundle + minify + ESM, browser platform, esnext), then
// measured raw / gzip (level 9) / brotli.
//
//   string  a min-length string check
//   email   an email format check
//   user    the full object schema from schemas.mjs + one parse
//   full    a namespace import (nothing to tree-shake) — upper bound
//
// The generated entries also export `check`, so run.mjs can import them and
// confirm the "user" case accepts the same fixtures as the runtime benchmark.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const TMP = join(here, '.tmp');
// Relative specifier from the generated entries in `.tmp/` to the built ESM
// bundle, so both Node (for the correctness check) and esbuild resolve it.
const UVLD_URL = relative(TMP, resolve(here, '..', 'dist', 'index.js')).split(sep).join('/');

const DATA = `{ name: 'Ada Lovelace', email: 'ada@example.com', age: 36, tags: ['math', 'code'], address: { city: 'London', zip: '12345' } }`;

const checkUvld = body => `import { ${body.imports} } from '${UVLD_URL}';
const DATA = ${DATA};
const schema = ${body.schema};
export const check = value => safeParse(schema, value).success;
export const accepted = check(DATA);
`;

const uvldObject = `object({
  name: string('', [minLength(2), maxLength(50)]),
  email: string('', [email()]),
  age: number('', [integerCheck(), min(18), max(120)]),
  tags: array(string()),
  address: object({ city: string(), zip: string('', [regex(/^\\d{5}$/)]) })
})`;

const entries = {
  uvld: {
    string: `import { string, minLength, safeParse } from '${UVLD_URL}';
const schema = string('', [minLength(2)]);
export const check = value => safeParse(schema, value).success;
export const accepted = check('hello');
`,
    email: `import { string, email, safeParse } from '${UVLD_URL}';
const schema = string('', [email()]);
export const check = value => safeParse(schema, value).success;
export const accepted = check('ada@example.com');
`,
    user: checkUvld({
      imports: 'object, string, number, array, minLength, maxLength, email, integerCheck, min, max, regex, safeParse',
      schema: uvldObject
    }),
    full: `import * as uvld from '${UVLD_URL}';
export default uvld;
`
  },

  zod: {
    string: `import { z } from 'zod';
const schema = z.string().min(2);
export const check = value => schema.safeParse(value).success;
export const accepted = check('hello');
`,
    email: `import { z } from 'zod';
const schema = z.email();
export const check = value => schema.safeParse(value).success;
export const accepted = check('ada@example.com');
`,
    user: `import { z } from 'zod';
const DATA = ${DATA};
const schema = z.object({
  name: z.string().min(2).max(50),
  email: z.email(),
  age: z.number().int().min(18).max(120),
  tags: z.array(z.string()),
  address: z.object({ city: z.string(), zip: z.string().regex(/^\\d{5}$/) })
});
export const check = value => schema.safeParse(value).success;
export const accepted = check(DATA);
`,
    full: `import * as zod from 'zod';
export default zod;
`
  },

  valibot: {
    string: `import * as v from 'valibot';
const schema = v.pipe(v.string(), v.minLength(2));
export const check = value => v.safeParse(schema, value).success;
export const accepted = check('hello');
`,
    email: `import * as v from 'valibot';
const schema = v.pipe(v.string(), v.email());
export const check = value => v.safeParse(schema, value).success;
export const accepted = check('ada@example.com');
`,
    user: `import * as v from 'valibot';
const DATA = ${DATA};
const schema = v.object({
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(50)),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(120)),
  tags: v.array(v.string()),
  address: v.object({ city: v.string(), zip: v.pipe(v.string(), v.regex(/^\\d{5}$/)) })
});
export const check = value => v.safeParse(schema, value).success;
export const accepted = check(DATA);
`,
    full: `import * as valibot from 'valibot';
export default valibot;
`
  },

  yup: {
    string: `import * as yup from 'yup';
const schema = yup.string().min(2).required();
export const check = value => {
  try { schema.validateSync(value, { abortEarly: false, strict: true }); return true; } catch { return false; }
};
export const accepted = check('hello');
`,
    email: `import * as yup from 'yup';
const schema = yup.string().email().required();
export const check = value => {
  try { schema.validateSync(value, { abortEarly: false, strict: true }); return true; } catch { return false; }
};
export const accepted = check('ada@example.com');
`,
    user: `import * as yup from 'yup';
const DATA = ${DATA};
const schema = yup.object({
  name: yup.string().min(2).max(50).required(),
  email: yup.string().email().required(),
  age: yup.number().integer().min(18).max(120).required(),
  tags: yup.array(yup.string().required()).required(),
  address: yup.object({ city: yup.string().required(), zip: yup.string().matches(/^\\d{5}$/).required() }).required()
});
export const check = value => {
  try { schema.validateSync(value, { abortEarly: false, strict: true }); return true; } catch { return false; }
};
export const accepted = check(DATA);
`,
    full: `import * as yup from 'yup';
export default yup;
`
  },

  joi: {
    string: `import Joi from 'joi';
const schema = Joi.string().min(2).required();
export const check = value => schema.validate(value, { convert: false }).error === undefined;
export const accepted = check('hello');
`,
    email: `import Joi from 'joi';
const schema = Joi.string().email().required();
export const check = value => schema.validate(value, { convert: false }).error === undefined;
export const accepted = check('ada@example.com');
`,
    user: `import Joi from 'joi';
const DATA = ${DATA};
const schema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(18).max(120).required(),
  tags: Joi.array().items(Joi.string()).required(),
  address: Joi.object({ city: Joi.string().required(), zip: Joi.string().pattern(/^\\d{5}$/).required() }).required()
});
export const check = value => schema.validate(value, { convert: false }).error === undefined;
export const accepted = check(DATA);
`,
    full: `import Joi from 'joi';
export default Joi;
`
  },

  ajv: {
    string: `import Ajv from 'ajv';
const ajv = new Ajv({ strict: false });
const validate = ajv.compile({ type: 'string', minLength: 2 });
export const check = value => validate(value);
export const accepted = check('hello');
`,
    email: `import Ajv from 'ajv';
const ajv = new Ajv({ strict: false });
const validate = ajv.compile({ type: 'string', pattern: '^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$' });
export const check = value => validate(value);
export const accepted = check('ada@example.com');
`,
    user: `import Ajv from 'ajv';
const DATA = ${DATA};
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile({
  type: 'object',
  required: ['name', 'email', 'age', 'tags', 'address'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 50 },
    email: { type: 'string', pattern: '^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$' },
    age: { type: 'number', minimum: 18, maximum: 120, multipleOf: 1 },
    tags: { type: 'array', items: { type: 'string' } },
    address: {
      type: 'object',
      required: ['city', 'zip'],
      properties: { city: { type: 'string' }, zip: { type: 'string', pattern: '^\\\\d{5}$' } }
    }
  }
});
export const check = value => validate(value);
export const accepted = check(DATA);
`,
    full: `import Ajv from 'ajv';
export default Ajv;
`
  }
};

export const SIZE_CASES = ['string', 'email', 'user', 'full'];

export function writeEntries() {
  mkdirSync(TMP, { recursive: true });
  const paths = {};
  for (const [lib, cases] of Object.entries(entries)) {
    paths[lib] = {};
    for (const [name, code] of Object.entries(cases)) {
      const file = join(TMP, `${lib}-${name}.mjs`);
      writeFileSync(file, code);
      paths[lib][name] = file;
    }
  }
  return paths;
}

export async function measureSize({ quiet = false } = {}) {
  const paths = writeEntries();
  const rows = [];
  for (const [lib, cases] of Object.entries(paths)) {
    const row = { id: lib, cases: {} };
    for (const name of SIZE_CASES) {
      row.cases[name] = {
        esbuild: await measureWith('esbuild', cases[name]),
        rollup: await measureWith('rollup', cases[name])
      };
    }
    rows.push(row);
    if (!quiet) {
      const line = SIZE_CASES
        .map(c => `${c} ${String(row.cases[c].esbuild.gzip).padStart(5)}/${String(row.cases[c].rollup.gzip).padStart(5)} B`)
        .join('   ');
      console.log(`${lib.padEnd(8)} ${line}   (esbuild/rollup gzip)`);
    }
  }
  return rows;
}

const measureWith = async (bundler, file) => {
  const buf = bundler === 'esbuild' ? await esbuildBundle(file) : await rollupBundle(file);
  return {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf).length
  };
};

// esbuild is what bundlejs.com uses: browser platform, esnext target.
const esbuildBundle = async file => {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [file],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    write: false,
    logLevel: 'silent'
  });
  return Buffer.from(result.outputFiles[0].text);
};

// Rollup tree-shakes namespace objects better than esbuild (zod 4's `z` is a
// namespace re-export), so it is reported separately rather than averaged.
const rollupBundle = async file => {
  const [{ rollup }, { nodeResolve }, { default: commonjs }, { default: json }, { default: terser }] = await Promise.all([
    import('rollup'),
    import('@rollup/plugin-node-resolve'),
    import('@rollup/plugin-commonjs'),
    import('@rollup/plugin-json'),
    import('@rollup/plugin-terser')
  ]);
  // yup/joi/ajv ship CommonJS or import CommonJS dependencies, so commonjs()
  // is required for Rollup to see them at all.
  const bundle = await rollup({
    input: file,
    plugins: [nodeResolve({ browser: true }), commonjs(), json()],
    onwarn() {}
  });
  const { output } = await bundle.generate({
    format: 'es',
    plugins: [terser({
      compress: { passes: 3, toplevel: true },
      format: { comments: false },
      module: true,
      mangle: { toplevel: true }
    })]
  });
  return Buffer.from(output[0].code);
};

export function sizeMarkdown(rows, bundler) {
  const header = ['library', ...SIZE_CASES.map(c => `${c} (gzip)`)];
  const body = rows.map(r => [r.id, ...SIZE_CASES.map(c => `${r.cases[c][bundler].gzip} B`)]);
  return `| ${header.join(' | ')} |\n| --- | ---: | ---: | ---: | ---: |\n${body.map(r => `| ${r.join(' | ')} |`).join('\n')}`;
}

export function rawMarkdown(rows, bundler) {
  const header = ['library', ...SIZE_CASES.map(c => `${c} (raw)`)];
  const body = rows.map(r => [r.id, ...SIZE_CASES.map(c => `${r.cases[c][bundler].raw} B`)]);
  return `| ${header.join(' | ')} |\n| --- | ---: | ---: | ---: | ---: |\n${body.map(r => `| ${r.join(' | ')} |`).join('\n')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await measureSize();
}
