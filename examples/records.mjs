// Use case: dictionaries, Maps, Sets and symbol keys — including the cases
// that 0.0.1 silently skipped.
import assert from 'node:assert/strict';
import {
  record, map, set, array, string, number, symbol, integer,
  min, max, safeParse, parse
} from '../src/index.js';

export function run() {
  const Scores = record(string('Key must be a string', [min(1)]), number('Score must be a number'));
  const scores = { ada: 10, alan: 8 };
  assert.equal(parse(Scores, scores), scores);
  const bad = safeParse(Scores, { ada: 'ten' });
  assert.equal(bad.error.issues[0].path, '["ada"]');

  // Symbol keys are really validated (Object.entries used to skip them).
  const TAG = Symbol('tag');
  const Tagged = record(symbol(), number());
  assert.equal(safeParse(Tagged, { [TAG]: 1 }).success, true);
  assert.equal(safeParse(Tagged, { [TAG]: 'one' }).success, false);
  assert.equal(safeParse(Tagged, { normalStringKey: 1 }).error.issues[0].origin, 'key');

  const Inventory = map(string(), integer('qty must be an integer', [min(0)]));
  assert.equal(parse(Inventory, new Map([['apple', 3]])).get('apple'), 3);
  assert.equal(safeParse(Inventory, new Map([['apple', -1]])).error.issues[0].path, '[0]');

  const UniqueIds = set(string(), '', [min(1, 'set must not be empty')]);
  assert.equal(parse(UniqueIds, new Set(['a', 'b'])).size, 2);
  assert.equal(safeParse(UniqueIds, new Set(['a', 2])).success, false);

  const Matrix = array(array(number(), '', [min(2)]), '', [max(3)]);
  assert.equal(parse(Matrix, [[1, 2], [3, 4]]).length, 2);
  assert.equal(safeParse(Matrix, [[1]]).error.issues[0].path, '[0]');

  console.log('records/maps/sets/symbol keys: OK');
}
