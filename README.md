# UVld Validation Library

[![tests](https://github.com/kethan/uvld/actions/workflows/node.js.yml/badge.svg)](https://github.com/kethan/uvld/actions/workflows/node.js.yml) [![Version](https://img.shields.io/npm/v/uvld.svg?color=success&style=flat-square)](https://www.npmjs.com/package/uvld) [![Badge size](https://deno.bundlejs.com/badge?q=uvld&treeshake=[*]&config={"compression":"brotli"})](https://unpkg.com/uvld) [![Badge size](https://deno.bundlejs.com/badge?q=uvld&treeshake=[*]&config={"compression":"gzip"})](https://unpkg.com/uvld)

This library provides a simple and extensible way to validate various data types and structures in JavaScript/TypeScript. It offers predefined validators for primitive types, custom validators, and combinators for complex validation logic. Additionally, it provides utility functions for parsing and safely parsing values based on schemas.

## Features

- Type Definitions: Simple type validators for primitive types like string, number, boolean, and more.
- Complex Structures: Support for validating complex structures like objects, arrays, maps, sets, and tuples.
- Custom Validators: Create custom validation logic to handle unique validation needs.
- Error Handling: Graceful error handling with detailed messages and issue tracking.
- Utility Functions: Includes utility functions for minimum/maximum constraints and logical operations on schemas (AND/OR).
- Type Inference: Automatically infer TypeScript types from schemas for better type safety in TypeScript projects.

## Installation

Install the module using npm:

**yarn**: `yarn add uvld`

**npm**: `npm i uvld`

**cdn**: https://esm.sh/uvld

## Usage

### Basic Validation

You can validate various primitive types using predefined validators:

```javascript
import { string, number, boolean, is } from "uvld";

const isString = string();
const isNumber = number();
const isBoolean = boolean();

console.log(is(isString, "Hello")); // true
console.log(is(isNumber, 42)); // true
console.log(is(isBoolean, true)); // true
```

### Validation with Custom Messages

You can provide custom error messages when the validation fails:

```javascript
const isString = string("This must be a string");
const isValid = is(isString, 123); // false
```

### Validation with Custom Messages and Additional Validations

Most validators support a `message` and an optional `validations` array. These allow you to specify a custom error message and add additional validation logic:

```javascript
const isString = string("This must be a string");
const isValid = is(isString, 123); // false
```

You can also add extra validation steps using the `validations` array:

```javascript
const isStringWithLength = string("Invalid string", [
	(value) =>
		value.length > 5 || { message: "String must be longer than 5 characters" },
]);

console.log(is(isStringWithLength, "Short")); // false
```

### Parsing and Safe Parsing

Use `parse` to validate a value and throw an error if validation fails:

```javascript
import { parse, string } from "uvld";

try {
	parse(string(), 42); // Throws an error
} catch (err) {
	console.error(err.message); // Expected string, received number
}
```

For safe validation, use `safeParse`:

```javascript
const result = safeParse(string(), 42);
if (!result.success) {
	console.error(result.error.message); // Expected string, received number
}
```

### Custom Validation

You can create custom validation logic using the `custom` validator:

```javascript
import { custom } from "uvld";

const isEven = custom((value) => value % 2 === 0, "Must be an even number");

console.log(is(isEven, 4)); // true
console.log(is(isEven, 3)); // false
```

### Complex Types

#### Object Validation

You can validate objects with specific schemas:

```javascript
import { object, string, number } from "uvld";

const schema = object({
	name: string(),
	age: number(),
});

parse(schema, { name: "John", age: 30 }); // Passes validation
```

#### Arrays, Tuples, and Records

You can validate arrays, tuples, and records:

```javascript
import { array, tuple, record, string, number } from "uvld";

const stringArray = array(string());
const numberTuple = tuple([number(), number()]);
const stringNumberRecord = record(string(), number());

parse(stringArray, ["hello", "world"]); // Passes validation
parse(numberTuple, [1, 2]); // Passes validation
parse(stringNumberRecord, { a: 1, b: 2 }); // Passes validation
```

### Additional Features

#### Optional and Nullable

You can mark values as optional or nullable:

```javascript
import { optional, nullable, string } from "uvld";

const optionalString = optional(string());
const nullableString = nullable(string());

parse(optionalString, undefined); // Passes validation
parse(nullableString, null); // Passes validation
```

#### Combinators: `and`, `or`, `not`

Combine validators using `and`, `or`, or `not`:

```javascript
import { and, or, not, string, number } from "uvld";

const stringOrNumber = or(string(), number());

console.log(is(stringOrNumber, "Hello")); // true
console.log(is(stringOrNumber, 42)); // true
console.log(is(stringOrNumber, true)); // false
```

#### Min/Max Validation

You can validate minimum and maximum constraints for strings, arrays, and numbers:

```javascript
import { min, max, string } from "uvld";

parse(min(5), "Hello"); // Passes validation
parse(max(10), "Hello World"); // Fails validation
```

## Error Handling

All validation errors are wrapped in a custom `VError` class, which includes detailed information about the issues:

```javascript
import { parse, string, VError } from "uvld";

try {
	parse(string(), 42);
} catch (err) {
	if (err instanceof VError) {
		console.error(err.issues); // Array of issues with detailed information
	}
}
```

## API Reference

### Validators

Each validator can take two optional parameters:

- `message` (optional): Custom error message when the validation fails.
- `validations` (optional): An array of additional validation functions for more granular checks.

- `string(message = '', validations = [])`: Validates that the value is a string.
- `number(message = '', validations = [])`: Validates that the value is a number.
- `boolean(message = '', validations = [])`: Validates that the value is a boolean.
- `func(message = '', validations = [])`: Validates that the value is a function.
- `symbol(message = '', validations = [])`: Validates that the value is a symbol.
- `bigint(message = '', validations = [])`: Validates that the value is a bigint.
- `integer(message = '', validations = [])`: Validates that the value is an integer.
- `date(message = '', validations = [])`: Validates that the value is a Date object.
- `promise(message = '', validations = [])`: Validates that the value is a Promise.
- `literal(value, message = '', validations = [])`: Validates that the value matches the specified literal.
- `instance(ref, message = '', validations = [])`: Validates that the value is an instance of the given class.
- `enums(values, message = '', validations = [])`: Validates that the value is one of the specified values.
- `optional(schema, message = '', validations = [])`: Marks a schema as optional.
- `nullable(schema, message = '', validations = [])`: Marks a schema as nullable.
- `record(keySchema, valueSchema, message = '', validations = [])`: Validates an object where keys and values match specific schemas.
- `map(keySchema, valueSchema, message = '', validations = [])`: Validates a Map object.
- `array(schema, message = '', validations = [])`: Validates an array of items matching the schema.
- `set(schema, message = '', validations = [])`: Validates a Set of items matching the schema.
- `object(schema, message = '', validations = [], exact = false)`: Validates an object with the given schema.
- `strict(schema, message = '', validations = [])`: Strictly validates an object, disallowing extra keys.
- `tuple(schemas, message = '', validations = [])`: Validates a tuple of values matching the given schemas.

### Combinators and Utilities

- `min(minValue, message = '', validations = [])`: Validates that the value meets the minimum requirement.
- `max(maxValue, message = '', validations = [])`: Validates that the value meets the maximum requirement.
- `or(...schemas)`: Validates that the value matches at least one of the provided schemas.
- `and(...schemas)`: Validates that the value matches all of the provided schemas.
- `not(schema, message = '', validations = [])`: Validates that the value does not match the provided schema.
- `lazy(resolveSchema)`: Lazily resolves a schema.
- `transform(schema, transformer)`: Transforms the value before validation.

### Utility Functions

- `is(schema, value)`: Returns `true` if the value passes the schema validation.
- `parse(schema, value)`: Validates the value and throws an error if validation fails.
- `safeParse(schema, value)`: Validates the value and returns a result object with either `success: true` or `success: false`.

### Custom Error Class

- `VError`: Custom error class for validation errors.

## License

This project is licensed under the MIT License.
