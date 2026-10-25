// Use case: domain-specific rules with `custom`, `define`, `and`, `or`, `not`.
import assert from 'node:assert/strict';
import {
  define, custom, string, number, and, or, not, min, max, safeParse, parse
} from '../src/index.js';

export function run() {
  // `define` is the same extension point the built-in validators use.
  const uuid = define('uuid', v => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v));
  const goodId = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(parse(uuid('Not a UUID'), goodId), goodId);
  assert.equal(safeParse(uuid(), 'nope').success, false);

  // Refinements can return a boolean, a message string, or a partial issue.
  const slug = string('Expected a slug', [
    v => /^[a-z0-9-]+$/.test(v) || 'Use lowercase letters, digits and dashes',
    min(3, 'Too short'),
    max(30, 'Too long')
  ]);
  assert.equal(safeParse(slug, 'hello-world').success, true);
  assert.equal(safeParse(slug, 'Hello World!').error.message, 'Use lowercase letters, digits and dashes');

  // Combinators compose whole schemas, not just refinements.
  const score = and(number('Must be a number'), min(0, 'Negative'), max(100, 'Over 100'));
  assert.equal(parse(score, 42), 42);
  assert.equal(safeParse(score, 101).error.message, 'Over 100');

  const id = or(string(), number());
  assert.equal(parse(id, 7), 7);
  assert.equal(safeParse(id, true).success, false);

  const notEmpty = not(custom(v => v === ''), 'Must not be empty');
  assert.equal(safeParse(notEmpty, 'x').success, true);
  assert.equal(safeParse(notEmpty, '').error.message, 'Must not be empty');

  console.log('uuid:', goodId);
  console.log('slug errors and combinators: OK');
}
