// Use case: async validation with `uvld/async` — a DB uniqueness check, an
// async transform, a lazy fallback, timeout and the resolveAsync pattern.
// In your project import from 'uvld/async'.
import assert from 'node:assert/strict';
import { string, object, array, safeParse } from '../src/index.js';
import { email, toLowerCase } from '../src/utils.js';
import {
  objectAsync, checkAsync, safeParseAsync, parseAsync, pipeAsync,
  transformAsync, fallbackAsync, resolveAsync
} from '../src/async.js';

const delay = ms => new Promise(r => setTimeout(r, ms));

export async function run() {
  // 1. An async uniqueness check on top of ordinary sync schemas.
  const taken = new Set(['ada@example.com']);
  const exists = async v => { await delay(2); return taken.has(v); };
  const Signup = objectAsync({
    email: string('', [email()]),
    handle: string()
  }, '', [
    checkAsync(async v => !(await exists(v.email)), 'Email already registered')
  ]);

  const ok = await safeParseAsync(Signup, { email: 'new@example.com', handle: 'newbie' });
  assert.equal(ok.success, true);
  const dup = await safeParseAsync(Signup, { email: 'ada@example.com', handle: 'ada' });
  assert.equal(dup.success, false);
  assert.equal(dup.error.issues[0].message, 'Email already registered');

  // 2. pipeAsync mixes an async transform, a sync utils action and a check.
  const CleanEmail = pipeAsync(string(), transformAsync(async v => v.trim()), toLowerCase(), email());
  assert.equal(await parseAsync(CleanEmail, '  ADA@EXAMPLE.COM  '), 'ada@example.com');

  // 3. A lazy async fallback.
  assert.equal(
    await parseAsync(fallbackAsync(string(), async () => { await delay(2); return 'guest'; }), 123),
    'guest'
  );

  // 4. resolveAsync: precompute async facts, then validate with the sync core.
  const payload = await resolveAsync({
    email: Promise.resolve('ada@example.com'),
    tags: [Promise.resolve('admin')]
  });
  assert.equal(safeParse(object({ email: string(), tags: array(string()) }), payload).success, true);

  // 5. A timeout bounds the whole validation.
  const slow = checkAsync(async () => { await delay(30); return true; });
  const timed = await safeParseAsync(
    objectAsync({ email: string() }, '', [slow]), { email: 'x' }, { timeout: 5 }
  );
  assert.equal(timed.success, false);
  assert.match(timed.error.issues[0].message, /timed out/);

  // 6. Overlapping validations never leak each other's transformed output.
  const slowTransform = (label, ms) =>
    pipeAsync(string(), transformAsync(async () => { await delay(ms); return label; }));
  const [a, b] = await Promise.all([
    parseAsync(slowTransform('first', 12), 'x'),
    parseAsync(slowTransform('second', 1), 'x')
  ]);
  assert.deepEqual([a, b], ['first', 'second']);

  console.log('signup duplicate:', dup.error.issues[0].message);
  console.log('clean email:', await parseAsync(CleanEmail, '  ADA@EXAMPLE.COM  '));
  console.log('timeout:', timed.error.issues[0].message);
  console.log('concurrent transforms:', a, b);
}
