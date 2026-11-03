// One representative schema, implemented in every library under test.
//
// The shape is a typical API payload: five fields, a nested object, an array,
// a string format, numeric bounds and a regex. Each library exposes the same
// tiny adapter surface so the harness never special-cases one of them:
//
//   buildUser()   -> (value) => boolean   (schema creation + check)
//   buildList()   -> (value) => boolean   (array of 100 of the same objects)
//   buildString() -> (value) => boolean   (min length 2)
//   buildEmail()  -> (value) => boolean   (email format)
//
// Every check returns `true` when the value is accepted, `false` otherwise, so
// the error paths of throw-based APIs (yup) and result-based APIs (zod, ...)
// are both included in the measurement.

import { readFileSync } from 'node:fs';

import * as uvld from '../dist/index.js';
import * as v from 'valibot';
import { z } from 'zod';
import * as yup from 'yup';
import Joi from 'joi';
import Ajv from 'ajv';

const ZIP = /^\d{5}$/;

export const VALID = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  age: 36,
  tags: ['math', 'code'],
  address: { city: 'London', zip: '12345' }
};

export const INVALID = {
  name: 'Ada Lovelace',
  email: 'not-an-email',
  age: 7,
  tags: ['math'],
  address: { city: 'London', zip: '12345' }
};

export const LIST = Array.from({ length: 100 }, (_, i) => ({
  ...VALID,
  name: `User ${i}`,
  email: `user${i}@example.com`,
  age: 20 + (i % 50)
}));

// --- uvld ------------------------------------------------------------------
const uvldUser = () => uvld.object({
  name: uvld.string('', [uvld.minLength(2), uvld.maxLength(50)]),
  email: uvld.string('', [uvld.email()]),
  age: uvld.number('', [uvld.integerCheck(), uvld.min(18), uvld.max(120)]),
  tags: uvld.array(uvld.string()),
  address: uvld.object({ city: uvld.string(), zip: uvld.string('', [uvld.regex(ZIP)]) })
});
const uvldCheck = schema => value => uvld.safeParse(schema, value).success;

// --- zod -------------------------------------------------------------------
const zodUser = () => z.object({
  name: z.string().min(2).max(50),
  email: z.email(),
  age: z.number().int().min(18).max(120),
  tags: z.array(z.string()),
  address: z.object({ city: z.string(), zip: z.string().regex(ZIP) })
});
const zodCheck = schema => value => schema.safeParse(value).success;

// --- valibot ---------------------------------------------------------------
const valibotUser = () => v.object({
  name: v.pipe(v.string(), v.minLength(2), v.maxLength(50)),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(120)),
  tags: v.array(v.string()),
  address: v.object({ city: v.string(), zip: v.pipe(v.string(), v.regex(ZIP)) })
});
const valibotCheck = schema => value => v.safeParse(schema, value).success;

// --- yup -------------------------------------------------------------------
const yupUser = () => yup.object({
  name: yup.string().min(2).max(50).required(),
  email: yup.string().email().required(),
  age: yup.number().integer().min(18).max(120).required(),
  tags: yup.array(yup.string().required()).required(),
  address: yup.object({
    city: yup.string().required(),
    zip: yup.string().matches(ZIP).required()
  }).required()
});
// `validateSync` throws on invalid input; the try/catch is part of yup's API.
const yupCheck = schema => value => {
  try {
    schema.validateSync(value, { abortEarly: false, strict: true });
    return true;
  } catch {
    return false;
  }
};

// --- joi -------------------------------------------------------------------
const joiUser = () => Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(18).max(120).required(),
  tags: Joi.array().items(Joi.string()).required(),
  address: Joi.object({
    city: Joi.string().required(),
    zip: Joi.string().pattern(ZIP).required()
  }).required()
});
const joiCheck = schema => value =>
  schema.validate(value, { abortEarly: false, convert: false }).error === undefined;

// --- ajv -------------------------------------------------------------------
// JSON Schema equivalent. `format: 'email'` needs ajv-formats, so the same
// shape is expressed as a pattern here; `multipleOf: 1` is JSON Schema's way
// to require an integer.
const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
const ajv = new Ajv({ allErrors: true, strict: false });
// A fresh object every call: ajv caches compiled validators per schema object,
// so reusing one literal would measure a cache hit instead of compilation.
const ajvUserSchema = () => ({
  type: 'object',
  required: ['name', 'email', 'age', 'tags', 'address'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 50 },
    email: { type: 'string', pattern: EMAIL_PATTERN },
    age: { type: 'number', minimum: 18, maximum: 120, multipleOf: 1 },
    tags: { type: 'array', items: { type: 'string' } },
    address: {
      type: 'object',
      required: ['city', 'zip'],
      properties: {
        city: { type: 'string' },
        zip: { type: 'string', pattern: '^\\d{5}$' }
      }
    }
  }
});
const ajvCheck = validate => value => validate(value);

const pkgVersion = id => {
  try {
    return JSON.parse(readFileSync(new URL(`./node_modules/${id}/package.json`, import.meta.url), 'utf8')).version;
  } catch {
    return '?';
  }
};

export const LIBS = [
  {
    id: 'uvld',
    label: 'uvld',
    version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version,
    buildUser: () => uvldCheck(uvldUser()),
    buildList: () => uvldCheck(uvld.array(uvldUser())),
    buildString: () => uvldCheck(uvld.string('', [uvld.minLength(2)])),
    buildEmail: () => uvldCheck(uvld.string('', [uvld.email()]))
  },
  {
    id: 'zod',
    label: 'zod',
    version: pkgVersion('zod'),
    buildUser: () => zodCheck(zodUser()),
    buildList: () => zodCheck(z.array(zodUser())),
    buildString: () => zodCheck(z.string().min(2)),
    buildEmail: () => zodCheck(z.email())
  },
  {
    id: 'valibot',
    label: 'valibot',
    version: pkgVersion('valibot'),
    buildUser: () => valibotCheck(valibotUser()),
    buildList: () => valibotCheck(v.array(valibotUser())),
    buildString: () => valibotCheck(v.pipe(v.string(), v.minLength(2))),
    buildEmail: () => valibotCheck(v.pipe(v.string(), v.email()))
  },
  {
    id: 'yup',
    label: 'yup',
    version: pkgVersion('yup'),
    buildUser: () => yupCheck(yupUser()),
    buildList: () => yupCheck(yup.array(yupUser())),
    buildString: () => yupCheck(yup.string().min(2).required()),
    buildEmail: () => yupCheck(yup.string().email().required())
  },
  {
    id: 'joi',
    label: 'joi',
    version: pkgVersion('joi'),
    buildUser: () => joiCheck(joiUser()),
    buildList: () => joiCheck(Joi.array().items(joiUser())),
    buildString: () => joiCheck(Joi.string().min(2).required()),
    buildEmail: () => joiCheck(Joi.string().email().required())
  },
  {
    id: 'ajv',
    label: 'ajv',
    version: pkgVersion('ajv'),
    // ajv compiles a JSON Schema into a validate function, so its creation
    // cost includes code generation — that shows up in the "create" case.
    buildUser: () => ajvCheck(ajv.compile(ajvUserSchema())),
    buildList: () => ajvCheck(ajv.compile({ type: 'array', items: ajvUserSchema() })),
    buildString: () => ajvCheck(ajv.compile({ type: 'string', minLength: 2 })),
    buildEmail: () => ajvCheck(ajv.compile({ type: 'string', pattern: EMAIL_PATTERN }))
  }
];
