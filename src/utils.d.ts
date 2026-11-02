// Backwards-compatible `uvld/utils` subpath: every utility is exported from the
// main entry now, so this module only re-exports. `integer` keeps its 1.x
// meaning (the utilities' integer check); from `uvld` the same check is
// exported as `integerCheck`, next to the core `integer()` schema factory.
export * from './index.js';
export { integerCheck as integer } from './index.js';
