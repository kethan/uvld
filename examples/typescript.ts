// Type inference example (compile-only). Run `npm run typecheck`.
// In your own project import from 'uvld' instead of '../src'.
import {
  string, number, object, array, tuple, optional, or, enums, literal,
  parse, safeParse, is, VError,
  type Infer, type Issue, type Validator
} from '../src';

const User = object({
  name: string(),
  age: number(),
  tags: array(string()),
  bio: optional(string())
});

type User = Infer<typeof User>;

const Id = or(string(), number());
type Id = Infer<typeof Id>;

const Role = enums(['admin', 'editor', 'viewer'] as const);
type Role = Infer<typeof Role>;

const Point = tuple([number(), number()]);
type Point = Infer<typeof Point>;

const Version = literal(1);
type Version = Infer<typeof Version>;
const version: Version = 1;
void version;

export function validateUser(input: unknown): { user: User } | { issues: Issue[] } {
  const result = safeParse(User, input);
  if (result.success) return { user: result.data };
  return { issues: result.error.issues }; // VError.issues is Issue[]
}

export function check(input: unknown): string | null {
  if (is(string(), input)) return input.toUpperCase(); // narrowed to string
  return null;
}

export function demo(): void {
  const user: User = parse(User, { name: 'Ada', age: 36, tags: ['ts'], bio: undefined });
  const id: Id = 42;
  const role: Role = 'admin';
  const point: Point = [13.0827, 80.2707];
  const schema: Validator<User> = User;
  const error = new VError('custom', []);
  void [user, id, role, point, schema, error];
}
