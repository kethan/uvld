// Backwards-compatible `uvld/utils` subpath.
//
// Everything lives in the main entry point now, so this module is a thin
// re-export rather than a second copy of the utilities. The utilities' integer
// check keeps its 1.x name here; from `uvld` it is exported as `integerCheck`
// so it can coexist with the core `integer()` schema factory.
export * from './index.js';
export { integerCheck as integer } from './index.js';
