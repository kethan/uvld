// Type-level tests. This file is checked by `npm run typecheck` (tsc --noEmit);
// it is deliberately not a Vitest test file.
import {
  string, number, object, array, tuple, optional, or, and, enums, literal,
  record, map, set, min, transform, define, custom, parse, safeParse, is,
  VError,
  type Infer, type Validator, type Issue, type Refinement, type SafeParseReturn
} from '../src';

const User = object({
  name: string(),
  age: number(),
  tags: array(string()),
  bio: optional(string())
});
type User = Infer<typeof User>;

const user: User = { name: 'Ada', age: 36, tags: ['x'], bio: undefined };
const userName: string = user.name;
const userAge: number = user.age;
// @ts-expect-error name is a string
const badName: number = user.name;
void [userName, userAge, badName];

const Id = or(string(), number());
type Id = Infer<typeof Id>;
const numericId: Id = 42;
const stringId: Id = 'abc';
// @ts-expect-error boolean is not part of the union
const badId: Id = true;
void [numericId, stringId, badId];

const Combined = and(object({ a: string() }), object({ b: number() }));
const combined: Infer<typeof Combined> = { a: 'x', b: 1 };
void combined;

const Point = tuple([number(), number()]);
const point: Infer<typeof Point> = [1, 2];
// @ts-expect-error tuple order is fixed
const badPoint: Infer<typeof Point> = ['x', 2];
void [point, badPoint];

const Role = enums(['admin', 'editor', 'viewer'] as const);
const role: Infer<typeof Role> = 'admin';
// @ts-expect-error 'root' is not a role
const badRole: Infer<typeof Role> = 'root';
void [role, badRole];

const Version = literal(2);
const version: Infer<typeof Version> = 2;
// @ts-expect-error only the literal 2 is allowed
const badVersion: Infer<typeof Version> = 3;
void [version, badVersion];

const Scores = record(string(), number());
const scores: Infer<typeof Scores> = { ada: 10 };
const inventory: Infer<ReturnType<typeof map>> = new Map();
const ids: Infer<ReturnType<typeof set>> = new Set();
void [scores, inventory, ids];
void min;

const Upper = transform(string(), (s: string) => s.toUpperCase());
const upper: string = parse(Upper, 'hi');
void upper;

const uuid: Validator<string> = define<string>('uuid', v => typeof v === 'string')();
const even = custom<number>(v => v % 2 === 0, 'even');
const refinement: Refinement = (v: string) => v.length > 2;
void [uuid, even, refinement];

const result: SafeParseReturn<User> = safeParse(User, {});
if (result.success) {
  const name: string = result.data.name;
  void name;
} else {
  const issues: Issue[] = result.error.issues;
  const message: string = issues[0].message;
  void message;
}

let unknownValue: unknown = 'hello';
if (is(string(), unknownValue)) {
  const narrowed: string = unknownValue;
  void narrowed;
}

const error: VError = new VError('oops', []);
const errorIssues: Issue[] = error.issues;
void errorIssues;
