const define = (type, validate) =>
  (message = '', validations = []) =>
    (value, path = "", origin = "value", issues = []) => !validate(value)
      ? [{ message: message || `Expected ${type}, received ${typeof value}`, expected: type, received: value, path, origin }]
      : (issues = validations.flatMap(v => v(value, path)).filter(v => v !== true), issues.length ? issues : []);
const string = define("string", value => typeof value === "string");
const boolean = define("boolean", value => typeof value === "boolean");
const number = define("number", value => typeof value === "number");
const func = define("function", value => typeof value === "function");
const symbol = define("symbol", value => typeof value === "symbol");
const bigint = define("bigint", value => typeof value === "bigint");
const integer = define("integer", value => Number.isInteger(value));
const date = define("date", value => value instanceof Date);
const promise = define("promise", value => value instanceof Promise);
const never = define("never", () => false);
const any = define("any", () => true);
const unknown = define("unknown", () => true);
const nullish = define("nullish", v => v == null || v === undefined);
const literal = (v, ...args) => define("literal", value => value === v)(...args);
const instance = (ref, ...args) => define("instance", value => value instanceof ref)(...args);
const enums = (values, ...args) => define("enums", value => values.includes(value))(...args);
const optional = (schema, ...args) => define("optional", v => v === undefined || schema(v).length === 0)(...args);
const nullable = (schema, ...args) => define("nullable", v => v === null || schema(v).length === 0)(...args);
// Complex types
const custom = (validate, message = "Invalid value", ...validations) => define("", validate)(message, ...validations);
const record = (keySchema, valueSchema, message = "", validations = []) =>
  define("record", value => value !== null && typeof value === "object" && !Array.isArray(value))(
    message,
    [
      (value, path) => Object.entries(value).flatMap(([key, val]) => [
        ...keySchema(key, `${path}${path ? '.' : ''}${key}`, 'key'),
        ...valueSchema(val, `${path}${path ? '.' : ''}${key}`)
      ]),
      ...validations,
    ]
  );
const map = (keySchema, valueSchema, message = '', validations = []) =>
  define("map", value => value instanceof Map)(
    message,
    [
      (value, path) =>
        [...value].flatMap(([key, val], index) => [
          ...keySchema(key, `${path}[${index}]`, 'key'),
          ...valueSchema(val, `${path}[${index}]`)
        ]),
      ...validations
    ]
  );
const array = (schema, message = "", validations = []) =>
  define("array", Array.isArray)(
    message,
    [
      (value, path) =>
        value.flatMap((item, index) =>
          schema(item, `${path}[${index}]`)
        ),
      ...validations
    ]
  );
const set = (schema, message = "", validations = []) =>
  define("set", value => value instanceof Set)(
    message,
    [
      (value, path) =>
        [...value].flatMap((item, index) =>
          schema(item, `${path}[${index}]`)
        ),
      ...validations
    ]
  );
const object = (schema, message = "", validations = [], exact = false) =>
  define("object", value => value !== null && typeof value === "object" && !Array.isArray(value))(
    message,
    [
      (value, path) => {
        const extraKeys = exact ? Object.keys(value).filter(key => !Object.keys(schema).includes(key)) : [];
        return extraKeys.length ? [{ message: `Unexpected keys found: ${extraKeys.join(', ')}`, expected: "object", received: value, path, origin: 'key' }]
          : Object.keys(schema).flatMap(key => schema[key](value[key], `${path}${path ? '.' : ''}${key}`));
      },
      ...validations
    ]
  );
const strict = (schema, message = "", validations = []) =>
  object(schema, message, validations, true);
const tuple = (schemas, message = "", validations = []) => define("tuple", value => Array.isArray(value))(
  message,
  [
    (value, path) => value.length !== schemas.length
      ? [{ message: `Expected tuple of length ${schemas.length}, received ${value.length}`, expected: "tuple", received: value.length, path }]
      : schemas.flatMap((schema, index) => schema(value[index], `${path}[${index}]`)),
    ...validations
  ]
);
// Utility functions
const min = (minValue, ...args) =>
  define("min", value => Array.isArray(value) || typeof value === "string" ? value.length >= minValue : (value instanceof Map || value instanceof Set) ? value.size >= minValue : value >= minValue)(`Min ${minValue}`, ...args);
const max = (maxValue, ...args) =>
  define("max", value => Array.isArray(value) || typeof value === "string" ? value.length <= maxValue : (value instanceof Map || value instanceof Set) ? value.size <= maxValue : value <= maxValue)(`Max ${maxValue}`, ...args);
const or = (...schemas) => (value, path) => {
  const issues = schemas.map(schema => schema(value, path)).flat();
  return issues.length === schemas.length ? issues : [];
};
const and = (...schemas) => (value, path) => schemas.flatMap(schema => schema(value, path));
const lazy = (resolveSchema) => (value, path) => resolveSchema()(value, path);
const transform = (schema, transformer) => (value) => schema(transformer(value));
// const transform = (schema, transformer, transformedValue) => (value) => (transformedValue = transformer(value), schema(transformedValue));
const not = (schema, message = '') => define("not", value => !is(schema, value))(message);
class VError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'VError';
    this.issues = issues;
  }
}
const is = (schema, value) => schema(value).length === 0;
const parse = (schema, value) => {
  const issues = schema(value);
  if (issues.length) {
    throw new VError((issues[0]?.message), issues)
  }
  return value;
};
const safeParse = (schema, value) => {
  const issues = schema(value);
  if (issues.length) {
    return { success: false, error: new VError(issues[0]?.message, issues) }
  }
  return { success: true, data: value }
};

export {
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
  unknown,
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
  is,
  parse,
  safeParse,
  VError
}