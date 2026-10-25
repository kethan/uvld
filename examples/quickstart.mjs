// Quickstart — in your own project replace '../src/index.js' with 'uvld'.
import assert from 'node:assert/strict';
import { string, number, object, is, parse, safeParse, VError } from '../src/index.js';

export function run() {
  // 1. Build a schema.
  const User = object({ name: string(), age: number() });

  // 2. Boolean check.
  assert.equal(is(User, { name: 'Ada', age: 36 }), true);
  assert.equal(is(User, { name: 'Ada', age: '36' }), false);

  // 3. Throw-on-error parsing.
  const user = parse(User, { name: 'Ada', age: 36 });
  assert.deepEqual(user, { name: 'Ada', age: 36 });

  // 4. Result-object parsing (no exceptions).
  const result = safeParse(User, { name: 'Ada', age: '36' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error instanceof VError);
    assert.equal(result.error.issues[0].path, '["age"]');
    assert.equal(result.error.issues[0].message, 'Expected number, got string');
  }

  console.log('validated user:', user);
  console.log('bad payload issue:', result.error.issues[0]);
}
