// Use case: the optional `uvld/utils` entry point — format checks, constraints,
// transforms and `pipe`. In your project import from 'uvld/utils'.
import assert from 'node:assert/strict';
import { object, string, array, number, safeParse, parse } from '../src/index.js';
import {
  email, minLength, maxLength, trim, toLowerCase, pipe, uuid, url,
  ipv4, creditCard, minValue, maxValue, integer, mapItems,
  fallback, flatten, semver, positive, uniqueItems, toUnique
} from '../src/utils.js';

export function run() {
  // 1. Checks drop straight into a core `validations` array.
  const Email = string('Expected a string', [email('Invalid email'), minLength(6), maxLength(254)]);
  assert.equal(safeParse(Email, 'ada@example.com').success, true);
  assert.equal(safeParse(Email, 'nope').error.message, 'Invalid email');

  // 2. `pipe` composes transforms + checks and returns transformed data.
  const CleanEmail = pipe(string(), trim(), toLowerCase(), email());
  assert.equal(parse(CleanEmail, '  ADA@Example.COM  '), 'ada@example.com');

  // 3. Format validators cover identifiers, networks, time and money.
  assert.equal(uuid()('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(url()('https://example.com'), true);
  assert.equal(ipv4()('192.168.1.1'), true);
  assert.equal(creditCard()('4111 1111 1111 1111'), true);
  assert.notEqual(creditCard()('4111 1111 1111 1112'), true);

  // 4. Constraints compose with core schemas.
  const Product = object({
    id: string('', [uuid()]),
    name: string('', [minLength(2), maxLength(60)]),
    price: number('', [minValue(0), maxValue(10000)]),
    stock: number('', [integer()]),
    tags: array(string())
  });
  const product = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Keyboard', price: 49.9, stock: 12, tags: ['input']
  };
  assert.equal(safeParse(Product, product).success, true);
  assert.equal(safeParse(Product, { ...product, stock: 1.5 }).success, false);

  // 5. Transform actions work on arrays too.
  assert.deepEqual(mapItems(x => x * 2)([1, 2, 3]), [2, 4, 6]);

  // 6. Production helpers: defaults, error maps and a few more formats.
  assert.equal(parse(fallback(string(), 'guest'), 123), 'guest');
  assert.equal(semver()('1.2.3-beta.1'), true);
  assert.equal(positive()(-1) === true, false);
  assert.equal(uniqueItems()([1, 1]) === true, false);
  assert.deepEqual(toUnique()([1, 1, 2]), [1, 2]);
  const bad = safeParse(object({ id: string('', [uuid()]), name: string() }), { id: 'nope', name: 1 });
  assert.equal(bad.success, false);
  const errors = flatten(bad.error);
  assert.ok(errors['["id"]'] && errors['["name"]']);

  console.log('clean email:', parse(CleanEmail, '  ADA@Example.COM  '));
  console.log('product validated:', product.name, product.price);
  console.log('flattened errors:', JSON.stringify(errors));
}
