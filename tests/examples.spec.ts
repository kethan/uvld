import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('all runnable examples execute without errors', () => {
  const output = execFileSync(process.execPath, ['examples/run-all.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });
  expect(output).toContain('=== quickstart ===');
  expect(output).toContain('=== api ===');
  expect(output).toContain('=== errors ===');
  expect(output).toContain('8 examples ran successfully.');
});
