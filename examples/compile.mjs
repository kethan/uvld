// Use case: compile a schema once, validate many values.
// In your project import from 'uvld/compile'.
import assert from 'node:assert/strict';
import {
  object, array, string, number, min, max, integerCheck, optional, or,
  literal, safeParse, is
} from '../src/index.js';
import { compile, compileParse } from '../src/compile.js';

export function run() {
  // 1. A schema compiled into a plain predicate.
  const User = object({
    name: string('name must be a string', [min(2)]),
    age: number('age must be a number', [integerCheck(), min(0), max(150)]),
    role: or(literal('admin'), literal('member')),
    bio: optional(string())
  });
  const valid = compile(User);

  assert.equal(valid({ name: 'Ada', age: 36, role: 'admin' }), true);
  assert.equal(valid({ name: 'Ada', age: -1, role: 'admin' }), false);
  assert.equal(valid({ name: 'Ada', age: 36, role: 'owner' }), false);
  // Same answer as the interpreter, including the fallback branches (`or`).
  assert.equal(valid({ name: 'A', age: 36, role: 'member' }), is(User, { name: 'A', age: 36, role: 'member' }));

  // 2. It is cached per schema, so the loop never re-walks the schema.
  assert.equal(compile(User), valid);

  // 3. compileParse() keeps safeParse's rich error when the predicate rejects.
  const parse = compileParse(User);
  assert.deepEqual(parse({ name: 'Ada', age: 36, role: 'member' }), {
    success: true,
    data: { name: 'Ada', age: 36, role: 'member' }
  });
  const bad = parse({ name: 'Ada', age: 'old', role: 'member' });
  assert.equal(bad.success, false);
  assert.equal(bad.error.issues[0].path, '["age"]');

  // 4. Bulk validation is the point: one predicate over many rows.
  const rows = array(User);
  const validRows = compile(rows);
  assert.equal(validRows([
    { name: 'Ada', age: 36, role: 'admin' },
    { name: 'Grace', age: 85, role: 'member' }
  ]), true);
  assert.equal(validRows([
    { name: 'Ada', age: 36, role: 'admin' },
    { name: 'Grace', age: -1, role: 'member' }
  ]), false);

  // 5. Anything uncompilable still answers exactly like is().
  const Tagged = object({ tag: literal('report'), value: string() });
  assert.equal(compile(Tagged)({ tag: 'report', value: 'x' }), true);
  assert.equal(safeParse(Tagged, { tag: 'other', value: 'x' }).success, false);
}
