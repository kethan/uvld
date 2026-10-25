// Use case: sign-up form validation with friendly messages and refinements.
// In your own project import from 'uvld' instead of '../src/index.js'.
import assert from 'node:assert/strict';
import { string, object, custom, min, max, safeParse } from '../src/index.js';

const email = string('Enter a valid email', [
  v => /\S+@\S+\.\S+/.test(v) || 'That does not look like an email'
]);

const password = string('Password is required', [
  min(8, 'Use at least 8 characters'),
  max(72, 'Keep it under 72 characters'),
  v => /[0-9]/.test(v) || 'Add at least one number'
]);

const Signup = object({
  email,
  password,
  confirm: string('Please confirm your password')
}, 'Please check the form', [
  form => form.password === form.confirm || 'Passwords do not match'
]);

export function run() {
  const good = { email: 'ada@example.com', password: 'correct1', confirm: 'correct1' };
  assert.equal(safeParse(Signup, good).success, true);

  const bad = safeParse(Signup, { ...good, confirm: 'different' });
  assert.equal(bad.success, false);
  assert.equal(bad.error.message, 'Passwords do not match');

  const short = safeParse(Signup, { ...good, password: 'abc', confirm: 'abc' });
  assert.equal(short.error.message, 'Use at least 8 characters');

  const invalidEmail = safeParse(Signup, { ...good, email: 'nope' });
  assert.equal(invalidEmail.error.issues[0].path, '["email"]');
  assert.equal(invalidEmail.error.issues[0].message, 'That does not look like an email');

  // `custom` is handy for one-off domain rules.
  const even = custom(v => v % 2 === 0, 'Must be even');
  assert.equal(safeParse(even, 4).success, true);

  console.log('form OK:', good.email);
  console.log('mismatch:', bad.error.message);
  console.log('short password:', short.error.message);
}
