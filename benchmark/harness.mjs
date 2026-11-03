// Minimal timing harness: no dependencies, no async, median of N samples.
//
// All libraries in a case are timed **interleaved** (one batch each per round,
// round-robin) because shared machines drift: if a case timed every library
// to completion in turn, a CPU that slows down halfway would penalise whoever
// ran last. Interleaving spreads any drift across all candidates, and the
// median ignores single bad rounds.

export const timeIt = (fn, iterations) => {
  let sink = 0;
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) sink += fn() ? 1 : 0;
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  // Keep the optimiser from deleting the loop body.
  if (sink < 0) throw new Error('unreachable');
  return elapsed;
};

const median = rates => {
  const sorted = [...rates].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// One candidate: calibrate a batch that runs for roughly `minSampleMs`, warm
// the JIT up, then time `samples` batches.
const prepare = (fn, { minSampleMs, maxIterations }) => {
  let iterations = 1;
  for (;;) {
    const elapsed = timeIt(fn, iterations);
    if (elapsed >= minSampleMs / 2 || iterations >= maxIterations) break;
    iterations = Math.min(iterations * 2, maxIterations);
  }
  for (let i = 0; i < 3; i++) timeIt(fn, Math.min(iterations, 1000));
  return { fn, iterations, rates: [] };
};

const finish = ({ iterations, rates }) => {
  const opsPerSec = median(rates);
  return { opsPerSec, nsPerOp: 1e9 / opsPerSec, iterations, samples: rates.length };
};

// Time several functions in the same case, interleaved.
export function benchAll(fns, { minSampleMs = 50, samples = 11, maxIterations = 1e7 } = {}) {
  const states = fns.map(fn => prepare(fn, { minSampleMs, maxIterations }));
  for (let round = 0; round < samples; round++) {
    for (const state of states) {
      const elapsed = timeIt(state.fn, state.iterations);
      state.rates.push(state.iterations / (elapsed / 1000));
    }
  }
  return states.map(finish);
}

// Time a single function (thin wrapper around benchAll).
export const bench = (fn, options) => benchAll([fn], options)[0];

export const fmtOps = n =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} k` : n.toFixed(0);

export const fmtBytes = n =>
  n >= 1024 ? `${(n / 1024).toFixed(2)} kB` : `${n} B`;

// Aligned console columns.
export function columns(headers, rows, { align = [] } = {}) {
  const all = [headers, ...rows].map(r => r.map(String));
  const widths = headers.map((_, i) => Math.max(...all.map(r => r[i].length)));
  const render = r => r
    .map((cell, i) => (align[i] === 'right' ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
    .join('  ');
  return [render(headers), widths.map(w => '─'.repeat(w)).join('  '), ...rows.map(r => render(r.map(String)))].join('\n');
}

// GitHub-flavoured markdown table.
export function mdTable(headers, rows, { align = [] } = {}) {
  const rule = headers.map((_, i) => (align[i] === 'right' ? '---:' : '---'));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${rule.join(' | ')} |`,
    ...rows.map(r => `| ${r.map(String).join(' | ')} |`)
  ].join('\n');
}
