// Runtime throughput benchmark.
//
//     node runtime.mjs            # full run (~1 minute)
//     BENCH_QUICK=1 node runtime.mjs
//
// Reports median ops/sec per case, plus the ratio to the fastest library.

import { benchAll, columns, fmtOps, mdTable } from './harness.mjs';
import { INVALID, LIBS, LIST, VALID } from './schemas.mjs';

const quick = process.env.BENCH_QUICK === '1';
const options = quick ? { minSampleMs: 15, samples: 5 } : { minSampleMs: 50, samples: 11 };

export const CASES = [
  {
    id: 'create',
    label: 'Create the object schema',
    make: lib => () => {
      lib.buildUser();
      return true;
    }
  },
  {
    id: 'valid',
    label: 'Validate a valid object',
    make: lib => {
      const check = lib.buildUser();
      return () => check(VALID);
    }
  },
  {
    id: 'invalid',
    label: 'Reject an invalid object',
    make: lib => {
      const check = lib.buildUser();
      return () => check(INVALID);
    }
  },
  {
    id: 'list',
    label: 'Validate 100 objects',
    make: lib => {
      const check = lib.buildList();
      return () => check(LIST);
    }
  },
  {
    id: 'string',
    label: 'Validate a string (min length 2)',
    make: lib => {
      const check = lib.buildString();
      return () => check('hello');
    }
  },
  {
    id: 'email',
    label: 'Validate an email address',
    make: lib => {
      const check = lib.buildEmail();
      return () => check('ada@example.com');
    }
  }
];

// Every library must agree on the fixtures, or the timings compare different
// work. Runs before any measurement and fails loudly.
export function verify() {
  return LIBS.map(lib => {
    const checkUser = lib.buildUser();
    const checkList = lib.buildList();
    const checkString = lib.buildString();
    const checkEmail = lib.buildEmail();
    return {
      id: lib.id,
      valid: checkUser(VALID) === true,
      invalid: checkUser(INVALID) === false,
      list: checkList(LIST) === true,
      listInvalid: checkList([...LIST.slice(1), INVALID]) === false,
      string: checkString('hello') === true && checkString('a') === false,
      email: checkEmail('ada@example.com') === true &&
        checkEmail('simon@example.com') === true &&
        checkEmail('nope') === false
    };
  });
}

export function runRuntime({ quiet = false } = {}) {
  const results = [];
  for (const testCase of CASES) {
    // One function per library, timed interleaved so machine drift hits all of
    // them equally.
    const timings = benchAll(LIBS.map(lib => testCase.make(lib)), options);
    const rows = LIBS.map((lib, i) => ({
      id: lib.id,
      label: lib.label,
      opsPerSec: timings[i].opsPerSec,
      nsPerOp: timings[i].nsPerOp,
      iterations: timings[i].iterations
    }));
    const best = Math.max(...rows.map(r => r.opsPerSec));
    rows.sort((a, b) => b.opsPerSec - a.opsPerSec);
    results.push({ ...testCase, rows, best });
    if (!quiet) {
      console.log(`\n${testCase.label}`);
      console.log(columns(
        ['library', 'ops/sec', 'ns/op', 'relative'],
        rows.map(r => [r.label, fmtOps(r.opsPerSec), r.nsPerOp.toFixed(0), `${(r.opsPerSec / best).toFixed(2)}x`]),
        { align: ['left', 'right', 'right', 'right'] }
      ));
    }
  }
  return results;
}

export function runtimeMarkdown(results) {
  return results.map(({ label, rows, best }) => {
    const table = mdTable(
      ['library', 'ops/sec', 'ns/op', 'relative'],
      rows.map(r => [r.label, fmtOps(r.opsPerSec), r.nsPerOp.toFixed(0), `${(r.opsPerSec / best).toFixed(2)}x`]),
      { align: ['---', '---:', '---:', '---:'] }
    );
    return `### ${label}\n\n${table}`;
  }).join('\n\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const checks = verify();
  const bad = checks.filter(c => Object.entries(c).some(([k, ok]) => k !== 'id' && !ok));
  if (bad.length) {
    console.error('Schemas disagree on the fixtures:', bad);
    process.exit(1);
  }
  console.log('correctness: all libraries agree on the fixtures');
  runRuntime();
}
