// Use case: structured error reporting for APIs and logs.
import assert from 'node:assert/strict';
import { object, array, string, number, record, safeParse, parse, VError } from '../src/index.js';

const Payload = object({
  user: object({ name: string(), age: number() }),
  tags: array(string()),
  meta: record(string(), number())
});

export function run() {
  const result = safeParse(Payload, {
    user: { name: 42, age: 'old' },
    tags: ['ok', 7],
    meta: { a: 1, b: 'bad' }
  });

  assert.equal(result.success, false);
  const { error } = result;
  assert.ok(error instanceof VError);
  assert.equal(error.name, 'VError');
  assert.equal(error.message, error.issues[0].message);

  // Each issue carries a stable shape — safe to serialise (no raw input).
  for (const issue of error.issues) {
    assert.deepEqual(Object.keys(issue).sort(), ['expected', 'message', 'origin', 'path', 'received']);
    assert.equal(typeof issue.received, 'string');
  }

  const paths = error.issues.map(i => i.path);
  assert.ok(paths.includes('["user"]["name"]'));
  assert.ok(paths.includes('["user"]["age"]'));
  assert.ok(paths.includes('["tags"][1]'));
  assert.ok(paths.includes('["meta"]["b"]'));

  // `parse` throws the same VError.
  try {
    parse(Payload, {});
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof VError);
    assert.ok(e.issues.length > 0);
  }

  // Unexpected exceptions inside user validators are converted into issues.
  const trap = safeParse(string('', [() => { throw new Error('db down'); }]), 'x');
  assert.equal(trap.success, false);
  assert.match(trap.error.message, /db down/);

  console.log('issues:', error.issues.length);
  console.log(error.issues.map(i => `${i.path || '(root)'}: ${i.message}`).join('\n'));
  console.log('trapped exception:', trap.error.message);
}
