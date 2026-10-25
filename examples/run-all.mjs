// Runs every example. Each example asserts its own expectations, so this
// doubles as an end-to-end smoke test (`npm run examples`, also run in CI).
import { run as quickstart } from './quickstart.mjs';
import { run as forms } from './forms.mjs';
import { run as api } from './api.mjs';
import { run as custom } from './custom.mjs';
import { run as recursive } from './recursive.mjs';
import { run as errors } from './errors.mjs';
import { run as transform } from './transform.mjs';
import { run as records } from './records.mjs';
import { run as utils } from './utils.mjs';
import { run as asyncExample } from './async.mjs';

const examples = [
  ['quickstart', quickstart],
  ['forms', forms],
  ['api', api],
  ['custom', custom],
  ['recursive', recursive],
  ['errors', errors],
  ['transform', transform],
  ['records', records],
  ['utils', utils],
  ['async', asyncExample]
];

for (const [name, run] of examples) {
  console.log(`\n=== ${name} ===`);
  await run();
}

console.log(`\n${examples.length} examples ran successfully.`);
