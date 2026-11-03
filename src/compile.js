// Experimental: compile a schema into a plain boolean predicate.
//
//     const valid = compile(object({ name: string('', [minLength(2)]) }));
//     valid({ name: 'Ada' });   // true
//
// The generic validator is an interpreter: every node allocates a context, a
// path string and an issue array, whether or not anything failed. `compile()`
// walks the schema once and returns a closure tree with the structure unrolled
// — no contexts, no paths, no arrays on the success path.
//
// It answers only "is this value valid". On `false`, callers that need
// `Issue[]` re-run the schema through the generic path (which is what
// `safeParse` does anyway); on `true` there is nothing to build.
//
// Metadata comes from the factories in index.js:
//   fn.meta  = [kind, check, validations]   (every define()-based validator)
//   fn.item  = schema                       (array)
//   fn.shape = () => [keys, validators]     (object)
// Anything without metadata — optional, nullable, or/and/not, lazy, transform,
// custom, record, map, set, tuple, strict — falls back to the generic path, so
// the compiled predicate stays correct, just not faster for that node.
//
// SPIKE: not exported from the package entry point yet, has no .d.ts, and is
// not covered by the byte-budget or smoke checks. See benchmark/spike-compile.mjs.

// Refinements may return true, null/undefined (meaning "no issue"), an empty
// Issue[], or a message/partial issue. Mirror call()'s rules.
const passes = r => r === true || r == null || (Array.isArray(r) && r.length === 0);

const fallback = schema => value => schema(value).length === 0;

// Validators whose children are walked by the generic machinery.
const STRUCTURAL = new Set(['tuple', 'record', 'map', 'set']);

export function compile(schema) {
  const compiled = new WeakMap();

  const node = s => {
    const hit = compiled.get(s);
    if (hit) return hit;

    const meta = s.meta;
    let fast;

    if (!meta) {
      fast = fallback(s);
    } else {
      const [kind, check, validations] = meta;

      // Kinds whose first validation is a structural walk that needs a real
      // context (tuple/record/map/set/strict object): let the generic path
      // handle the node rather than calling that walk with no context.
      if (STRUCTURAL.has(kind) || (kind === 'object' && s.exact)) {
        fast = fallback(s);
        compiled.set(s, fast);
        return fast;
      }

      if (kind === 'object') {
        const [keys, validators] = s.shape();
        const subs = validators.map(node);
        const refinements = validations.slice(1); // [0] is the shape walk itself
        fast = value => {
          if (!check(value)) return false;
          for (let i = 0; i < subs.length; i++) {
            if (!subs[i](value[keys[i]])) return false;
          }
          for (let i = 0; i < refinements.length; i++) {
            if (!passes(refinements[i](value))) return false;
          }
          return true;
        };
      } else if (kind === 'array') {
        const sub = node(s.item);
        const refinements = validations.slice(1); // [0] is the element walk
        fast = value => {
          if (!check(value)) return false;
          for (let i = 0; i < value.length; i++) {
            if (!sub(value[i])) return false;
          }
          for (let i = 0; i < refinements.length; i++) {
            if (!passes(refinements[i](value))) return false;
          }
          return true;
        };
      } else {
        // Leaf: the type predicate plus its refinements.
        fast = value => {
          if (!check(value)) return false;
          for (let i = 0; i < validations.length; i++) {
            if (!passes(validations[i](value))) return false;
          }
          return true;
        };
      }
    }

    compiled.set(s, fast);
    return fast;
  };

  const fast = node(schema);
  fast.schema = schema;
  return fast;
}

// Compiled predicate that falls back to a full parse when it rejects, so the
// caller keeps the rich error. Returns a safeParse-shaped result.
export function compileSafeParse(schema, safeParse) {
  const fast = compile(schema);
  return value => (fast(value) ? { success: true, data: value } : safeParse(schema, value));
}
