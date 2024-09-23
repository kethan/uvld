import { expect, describe, test } from 'vitest'

import {
  string,
  boolean,
  number,
  func,
  symbol,
  bigint,
  integer,
  date,
  promise,
  literal,
  instance,
  enums,
  optional,
  nullable,
  never,
  any,
  nullish,
  custom,
  record,
  map,
  array,
  set,
  object,
  strict,
  tuple,
  min,
  max,
  or,
  and,
  lazy,
  transform,
  not,
  parse,
  safeParse,
  VError,
  Infer,
  is,
} from './src'; // Adjust the import according to your file structure

describe('Validation Library Tests', () => {
  test('string validation', () => {
    expect(string().length).toBe(1);
    expect(safeParse(string(), "test")).toEqual({ success: true, data: "test" });
    expect(safeParse(string(), 123)).toEqual({ success: false, error: expect.any(VError) });
  });

  test('boolean validation', () => {
    expect(safeParse(boolean(), true)).toEqual({ success: true, data: true });
    expect(safeParse(boolean(), "not a boolean")).toEqual({ success: false, error: expect.any(VError) });
  });

  test('number validation', () => {
    expect(safeParse(number(), 42)).toEqual({ success: true, data: 42 });
    expect(safeParse(number(), "42")).toEqual({ success: false, error: expect.any(VError) });
  });

  test('function validation', () => {
    expect(safeParse(func(), () => { })).toEqual({ success: true, data: expect.any(Function) });
    expect(safeParse(func(), "not a function")).toEqual({ success: false, error: expect.any(VError) });
  });

  test('literal validation', () => {
    expect(safeParse(literal(42), 42)).toEqual({ success: true, data: 42 });
    expect(safeParse(literal(42), 43)).toEqual({ success: false, error: expect.any(VError) });
  });

  test('instance validation', () => {
    class MyClass { }
    expect(safeParse(instance(MyClass), new MyClass())).toEqual({ success: true, data: expect.any(MyClass) });
    expect(safeParse(instance(MyClass), {})).toEqual({ success: false, error: expect.any(VError) });
  });

  test('enums validation', () => {
    const colorEnum = enums(['red', 'green', 'blue']);
    expect(safeParse(colorEnum, 'red')).toEqual({ success: true, data: 'red' });
    expect(safeParse(colorEnum, 'yellow')).toEqual({ success: false, error: expect.any(VError) });
  });

  test('optional validation', () => {
    const optionalString = optional(string());
    expect(safeParse(optionalString, "test")).toEqual({ success: true, data: "test" });
    expect(safeParse(optionalString, undefined)).toEqual({ success: true, data: undefined });
  });

  test('nullable validation', () => {
    const nullableString = nullable(string());
    expect(safeParse(nullableString, null)).toEqual({ success: true, data: null });
    expect(safeParse(nullableString, "test")).toEqual({ success: true, data: "test" });
  });

  test('record validation', () => {
    const recordSchema = record(string(), number());
    expect(safeParse(recordSchema, { key1: 1, key2: 2 })).toEqual({ success: true, data: { key1: 1, key2: 2 } });
    expect(safeParse(recordSchema, { key1: "not a number" })).toEqual({ success: false, error: expect.any(VError) });
  });

  test('array validation', () => {
    const arraySchema = array(number());
    expect(safeParse(arraySchema, [1, 2, 3])).toEqual({ success: true, data: [1, 2, 3] });
    expect(safeParse(arraySchema, [1, "not a number"])).toEqual({ success: false, error: expect.any(VError) });
  });

  test('object validation', () => {
    const objectSchema = object({ a: string(), b: number() });
    expect(safeParse(objectSchema, { a: "hello", b: 42 })).toEqual({ success: true, data: { a: "hello", b: 42 } });
    expect(safeParse(objectSchema, { a: "hello", b: "not a number" })).toEqual({ success: false, error: expect.any(VError) });
  });

  test('tuple validation', () => {
    const tupleSchema = tuple([string(), number()]);
    expect(safeParse(tupleSchema, ["test", 42])).toEqual({ success: true, data: ["test", 42] });
    expect(safeParse(tupleSchema, ["test", "not a number"])).toEqual({ success: false, error: expect.any(VError) });
  });

  test('min and max validation', () => {
    expect(safeParse(and(string(), min(3)), "hi")).toEqual({ success: false, error: expect.any(VError) });
    expect(safeParse(and(string(), max(2)), "hi")).toEqual({ success: true, data: "hi" });
  });

  test('or validation', () => {
    const orSchema = or(string(), number());
    expect(safeParse(orSchema, "hello")).toEqual({ success: true, data: "hello" });
    expect(safeParse(orSchema, 123)).toEqual({ success: true, data: 123 });
    expect(safeParse(orSchema, true)).toEqual({ success: false, error: expect.any(VError) });
  });

  test('and validation', () => {
    const andSchema = and(string(), min(3));
    expect(safeParse(andSchema, "hi")).toEqual({ success: false, error: expect.any(VError) });
    expect(safeParse(andSchema, "hello")).toEqual({ success: true, data: "hello" });
  });

  test('not validation', () => {
    const notString = not(string());
    expect(safeParse(notString, 123)).toEqual({ success: true, data: 123 });
    expect(safeParse(notString, "hello")).toEqual({ success: false, error: expect.any(VError) });
  });

  test('error handling in parse', () => {
    expect(() => parse(string(), 123)).toThrow(VError);
    expect(() => parse(number(), "not a number")).toThrow(VError);
    expect(parse(number(), 42)).toBe(42);
  });

  test('lazy validation', () => {
    const lazySchema = lazy(() => string());
    const Node = object({
      id: number(),
      children: lazy(() => array(Node as any)),
    });
    // type NodeSchema = Infer<typeof Node>;
    expect(safeParse(lazySchema, "hello")).toEqual({ success: true, data: "hello" });
    expect(safeParse(Node, { id: 1, children: [{ id: 2, children: [] }] })).toEqual({ success: true, data: { id: 1, children: [{ id: 2, children: [] }] } });
  });

  // test('transform validation', () => {
  //   const transformSchema = transform(string(), (value: string) => value.toUpperCase());
  //   console.log(transformSchema("hello"));
  //   expect(safeParse(transformSchema, "hello")).toEqual({ success: true, data: "HELLO" });
  // });

  test('custom validation 1', () => {
    const customSchema = custom<string>((value) => value.length >= 5, "Value must be longer than 5 characters");
    expect(safeParse(customSchema, "hello")).toEqual({ success: true, data: "hello" });
  });

  test('custom validation 2', () => {
    const customSchema = custom<number>((value) => value >= 5, "Value must be higher than 5", [number()]);
    expect(safeParse(customSchema, 6)).toEqual({ success: true, data: 6 });
  });

  test('is', () => {
    expect(is(string(), 2)).toBe(false);
    expect(is(string(), "Hello")).toBe(true);
  });

  test("parse", () => {
    expect(parse(string(), "hello")).toBe("hello");
    expect(parse(number(), 123)).toBe(123);
    expect(parse(boolean(), true)).toBe(true);
    expect(parse(date(), new Date("2021-01-01"))).toEqual(new Date("2021-01-01"));
    expect(parse(array(string()), ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(parse(object({ key: string() }), { key: "value" })).toEqual({ key: "value" });
    expect(parse(tuple([string(), number()]), ["hello", 123])).toEqual(["hello", 123]);
    expect(parse(or(string(), number()), "hello")).toBe("hello");
    expect(parse(or(string(), number()), 1)).toBe(1);
    expect(parse(and(string(), min(2)), "123")).toBe("123");
    expect(parse(and(object({ key1: string() }), object({ key2: number() })), { key1: "value", key2: 123 })).toEqual({ key1: "value", key2: 123 });
  });

  test("strict", () => {
    const strictSchema = strict({ key1: string(), key2: number() });

    // Valid case
    expect(safeParse(strictSchema, { key1: "value", key2: 123 })).toEqual({ success: true, data: { key1: "value", key2: 123 } });

    // Invalid case: extra key
    expect(safeParse(strictSchema, { key1: "value", key2: 123, key3: "extra" })).toEqual({
      success: false,
      error: new VError("Unexpected keys found: key3", [
        { message: "Unexpected keys found: key3", expected: "object", received: { key1: "value", key2: 123, key3: "extra" }, path: "", origin: "key" }
      ])
    });

    // Invalid case: missing key
    expect(safeParse(strictSchema, { key1: "value" })).toEqual({
      success: false,
      error: new VError("Expected number, received undefined", [
        { message: "Expected number, received undefined", expected: "number", received: undefined, path: "key2", origin: "value" }
      ])
    });

    // Invalid case: wrong type
    expect(safeParse(strictSchema, { key1: "value", key2: "not a number" })).toEqual({
      success: false,
      error: new VError("Expected number, received string", [
        { message: "Expected number, received string", expected: "number", received: "not a number", path: "key2", origin: "value" }
      ])
    });
  });

  test("Complex", () => {
    const objectSchema = strict({
      stringField: string(),
      // neverField: never(),
      numberField: number(),
      integerField: integer(),
      booleanField: boolean(),
      bigintField: bigint(),
      symbolField: symbol(),
      nullField: nullish(),
      undefinedField: custom(value => value === undefined, "Value should be undefined"),
      nestedObject: strict({
        dateField: date(),
        promiseField: promise(),
        functionField: func(),
        nestedArray: array(
          tuple([
            array(string()),  // Assume this is the intended schema for array elements
            set(any()),
            map(string(), any()),
            //@ts-ignore
            record(symbol(), map(string(), string()))
          ])
        ),
        arrayOfObjects: array(strict({
          name: string(),
          details: strict({
            description: string(),
            attributes: array(strict({
              color: string(),
              size: string()
            }))
          })
        })),
        nestedFunction: func(),
        //@ts-ignore
        nestedRecord: record(symbol(), map(string(), any()))
      }),
      deeplyNestedArray: array(strict({
        firstLevel: array(strict({
          secondLevel: array(strict({
            thirdLevel: array(strict({
              fourthLevel: array(strict({
                fifthLevel: array(string())
              }))
            }))
          }))
        }))
      }))
    });

    const deeplyNestedObject = {
      stringField: "Hello, world!",
      numberField: 123,
      integerField: 123,
      booleanField: true,
      bigintField: BigInt(9876543210123456789),
      symbolField: Symbol('symbolKey'),
      nullField: null,
      undefinedField: undefined,
      nestedObject: {
        dateField: new Date(),
        promiseField: new Promise((resolve) => resolve("Resolved Value")),
        functionField: function () { return "I am a function"; },
        nestedArray:
          [
            [["a", "b"],
            new Set([
              "a",
              "b",
              "c",
              { nestedObject: { field: "Value" } }
            ]),
            new Map([
              ["key1", "value1"],
              ["key2", "value2"]
            ]),
            {
              [Symbol('recordKey')]: new Map(
                [
                  [1, false]
                ]
              )
            }
            ]
          ],
        arrayOfObjects: [
          {
            name: "Item 1",
            details: {
              description: "Description of Item 1",
              attributes: [
                { color: "red", size: "large" },
                { color: "blue", size: "medium" }
              ]
            }
          },
          {
            name: "Item 2",
            details: {
              description: "Description of Item 2",
              attributes: [
                { color: "green", size: "small" },
                { color: "yellow", size: "extra-large" }
              ]
            }
          }
        ],
        nestedFunction: () => ({
          innerFunction: () => new Promise((resolve) => resolve({ innerValue: "Nested Promise Value" })),
        }),
        nestedRecord: {
          [Symbol('recordKey')]: {
            recordField: [
              {
                recordItem: {
                  value: 100,
                  innerMap: new Map<string, string | Set<number>>([
                    ["mapKey1", "mapValue1"],
                    ["mapKey2", new Set([1, 2, 3])]
                  ])
                }
              }
            ]
          }
        }
      },
      deeplyNestedArray: [
        {
          firstLevel: [
            {
              secondLevel: [
                {
                  thirdLevel: [
                    {
                      fourthLevel: [
                        {
                          fifthLevel: [
                            "A deeply nested string in an array"
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    type DeeplyNestedObject = Infer<typeof objectSchema>;
    const parsed: DeeplyNestedObject = parse(objectSchema, deeplyNestedObject);
    expect(parsed).toEqual(deeplyNestedObject)
  });

  test("never", () => {
    const neverSchema = never();
    expect(safeParse(neverSchema, "test")).toEqual({ success: false, error: expect.any(VError) });
  });
});
