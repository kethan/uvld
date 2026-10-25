// Use case: validate an incoming API payload (nested objects, unions, enums,
// arrays, tuples, strict mode) before it reaches business logic.
import assert from 'node:assert/strict';
import {
  string, number, boolean, object, strict, array, tuple, enums,
  optional, nullable, or, literal, integer, min, parse, safeParse
} from '../src/index.js';

const Address = strict({ city: string(), zip: string('ZIP is required') });
const Item = object({ sku: string(), qty: integer('qty must be an integer', [min(1)]) });
const Status = enums(['pending', 'paid', 'shipped']);

const Order = strict({
  id: string(),
  version: literal(2),
  status: Status,
  customer: object({ name: string(), email: optional(string()) }),
  address: Address,
  items: array(Item, 'items must be an array', [min(1, 'order needs at least one item')]),
  total: number(),
  paid: boolean(),
  note: nullable(string()),
  coupon: or(string(), literal(null)),
  geo: tuple([number(), number()])
});

export function run() {
  const payload = {
    id: 'ord_1',
    version: 2,
    status: 'paid',
    customer: { name: 'Ada' },
    address: { city: 'Chennai', zip: '600001' },
    items: [{ sku: 'A-1', qty: 2 }],
    total: 999.5,
    paid: true,
    note: null,
    coupon: 'WELCOME',
    geo: [13.0827, 80.2707]
  };

  assert.equal(parse(Order, payload), payload);

  const tampered = safeParse(Order, {
    ...payload,
    items: [{ sku: 'A-1', qty: 0 }],
    address: { city: 'Chennai', zip: '600001', hacked: true }
  });
  assert.equal(tampered.success, false);
  const paths = tampered.error.issues.map(i => i.path);
  assert.ok(paths.includes('["address"]'));
  assert.ok(paths.includes('["items"][0]["qty"]'));

  console.log('order accepted:', payload.id, payload.status);
  console.log('tampered rejected at:', paths.join(', '));
}

void Status;
