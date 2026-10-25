// Use case: normalise input before validating it.
// `transform(schema, fn)` validates fn(value); at the root, parse/safeParse
// return fn(value) as the data (fn is applied exactly once).
import assert from 'node:assert/strict';
import { string, number, object, transform, parse, safeParse, min } from '../src/index.js';

export function run() {
  const Upper = transform(string('Expected text', [min(2)]), s => String(s).trim().toUpperCase());
  assert.equal(parse(Upper, '  hello  '), 'HELLO');
  assert.equal(safeParse(Upper, 'hi').data, 'HI');

  // A classic coercion: accept a numeric string, return a number.
  const Amount = transform(number('Not a number', [min(0)]), v => Number(v));
  assert.equal(parse(Amount, '12.5'), 12.5);
  assert.equal(safeParse(Amount, 'nope').success, false);

  // Nested transforms affect validation only; the returned object is the input.
  // Normalise fields before calling parse when you also need transformed data.
  const Form = object({ name: transform(string(), s => String(s).trim()) });
  const input = { name: '  Ada  ' };
  assert.equal(parse(Form, input), input);
  const cleaned = { ...input, name: input.name.trim() };
  assert.equal(cleaned.name, 'Ada');

  console.log('Upper:', parse(Upper, '  hello  '));
  console.log('Amount:', parse(Amount, '12.5'));
  console.log('nested transform is validation-only; cleaned copy:', cleaned);
}
