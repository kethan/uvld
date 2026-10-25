// Compatibility shim for legacy `moduleResolution: node10` consumers, which
// do not read the `exports` map. Modern resolution uses ./dist/utils.d.ts.
export * from './dist/utils.js';
