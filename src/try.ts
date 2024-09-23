export interface Issue<T> {
    message: string;
    type: string;
    value: T;
    path: string;
    origin: string;
}

export type Validator<T> = (
    value: unknown,
    path?: string,
    origin?: string
) => Issue<T>[] | boolean[];

export type Infer<V> = V extends Validator<infer T> ? T : never;

export class VError extends Error {
    issues: Issue<unknown>[];
    constructor(message: string, issues: Issue<unknown>[] = []) {
        super(message);
        this.name = 'VError';
        this.issues = issues;
    }
}

export function define<T>(
    type: string,
    validate: (value: unknown) => value is T
): (message?: string, validations?: Validator<T>[]) => Validator<T> {
    return (message = '', validations = []) =>
        (value: unknown, path = "", origin = "value"): Issue<T>[] => {
            if (!validate(value)) {
                return [{
                    message: message || `Expected ${type}, received ${typeof value}`,
                    type,
                    value: value as T,
                    path,
                    origin
                }];
            }
            const issues = validations.flatMap(v => v(value, path, origin));
            return issues.length ? issues : [];
        };
}

export const string = define<string>("string", (v): v is string => typeof v === "string");
export const number = define<number>("number", (v): v is number => typeof v === "number" && !isNaN(v));
export const boolean = define<boolean>("boolean", (v): v is boolean => typeof v === "boolean");
export const bigint = define<bigint>("bigint", (v): v is bigint => typeof v === "bigint");
export const symbol = define<symbol>("symbol", (v): v is symbol => typeof v === "symbol");
export const _undefined = define<undefined>("undefined", (v): v is undefined => v === undefined);
export const _null = define<null>("null", (v): v is null => v === null);
export const _void = define<void>("void", (v): v is void => v === undefined);

export function literal<T extends string | number | boolean | null | undefined>(
    v: T,
    message = `Expected ${v}`,
    ...validations: Validator<T>[]
): Validator<T> {
    return define<T>(`literal:${v}`, (value): value is T => value === v)(message, validations);
}

export function optional<T>(
    schema: Validator<T>,
    message = "Optional value",
    ...validations: Validator<T | undefined>[]
): Validator<T | undefined> {
    return (value, path, origin) =>
        value === undefined ? [] : schema(value, path, origin).concat(validations.flatMap(v => v(value, path, origin)));
}

export function nullable<T>(
    schema: Validator<T>,
    message = "Nullable value",
    ...validations: Validator<T | null>[]
): Validator<T | null> {
    return (value, path, origin) =>
        value === null ? [] : schema(value, path, origin).concat(validations.flatMap(v => v(value, path, origin)));
}

export function array<T>(
    schema: Validator<T>,
    message = "Invalid array",
    validations: Validator<T[]>[] = []
): Validator<T[]> {
    return define<T[]>("array", Array.isArray)(
        message,
        [
            (value, path) => (value as T[]).flatMap((item, index) => schema(item, `${path}[${index}]`)),
            ...validations
        ]
    );
}

export function object<T extends Record<string, Validator<any>>>(
    schema: T,
    message = "Invalid object",
    validations: Validator<{ [K in keyof T]: Infer<T[K]> }>[] = []
): Validator<{ [K in keyof T]: Infer<T[K]> }> {
    return define<{ [K in keyof T]: Infer<T[K]> }>("object", (v): v is { [K in keyof T]: Infer<T[K]> } => typeof v === "object" && v !== null)(
        message,
        [
            (value, path) => Object.entries(schema).flatMap(([key, validator]) =>
                validator((value as any)[key], `${path}${path ? '.' : ''}${key}`)
            ),
            ...validations
        ]
    );
}

export function or<T extends Validator<any>[]>(
    ...schemas: T
): Validator<Infer<T[number]>> {
    return (value, path, origin) => {
        const issues = schemas.map(schema => schema(value, path, origin)).flat();
        return issues.length === schemas.length ? issues : [];
    };
}

export function and<T extends Validator<any>[]>(
    ...schemas: T
): Validator<UnionToIntersection<Infer<T[number]>>> {
    return (value, path, origin) => schemas.flatMap(schema => schema(value, path, origin));
}

export function is<T>(schema: Validator<T>, value: unknown): value is T {
    return schema(value).length === 0;
}

export function parse<T>(schema: Validator<T>, value: unknown): T {
    const issues = schema(value);
    if (issues.length) {
        throw new VError(issues[0]?.message, issues);
    }
    return value as T;
}

export function safeParse<T>(
    schema: Validator<T>,
    value: unknown
): { success: true; data: T } | { success: false; error: VError } {
    try {
        const issues = schema(value);
        if (issues.length) {
            return { success: false, error: new VError(issues[0]?.message, issues) };
        }
        return { success: true, data: value as T };
    } catch (error) {
        if (error instanceof VError) {
            return { success: false, error };
        }
        throw error;
    }
}

// Additional utility functions can be implemented similarly