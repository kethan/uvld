// Use case: recursive data (comment trees, menus, org charts) with `lazy`.
// Also shows that circular input is reported, not crashed on.
import assert from 'node:assert/strict';
import { object, array, string, number, lazy, safeParse } from '../src/index.js';

const Comment = object({
  id: number(),
  body: string(),
  replies: array(lazy(() => Comment))
});

export function run() {
  const thread = {
    id: 1,
    body: 'root',
    replies: [
      { id: 2, body: 'child', replies: [] },
      { id: 3, body: 'child 2', replies: [{ id: 4, body: 'grandchild', replies: [] }] }
    ]
  };
  assert.equal(safeParse(Comment, thread).success, true);

  const broken = { id: 1, body: 'root', replies: [{ id: 'not a number', body: 'x', replies: [] }] };
  const result = safeParse(Comment, broken);
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path, '["replies"][0]["id"]');

  const circular = { id: 1, body: 'loop', replies: [] };
  circular.replies.push(circular);
  const cyclic = safeParse(Comment, circular);
  assert.equal(cyclic.success, false);
  assert.equal(cyclic.error.issues[0].message, 'Too deep');

  console.log('recursive tree validated:', thread.replies.length, 'top-level replies');
  console.log('nested error path:', result.error.issues[0].path);
  console.log('circular input rejected safely:', cyclic.error.message);
}
