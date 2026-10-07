// ONE COMMAND FOR EVERYTHING: npm run test:all
// Runs, in order: unit + database-rule tests, production build, dependency audit, browser tests (phone and desktop, with accessibility),
// Lighthouse, and the known-gap checks (informational: they are expected to fail until the gaps are fixed).
// Add --live to also run the live test on the linked real Supabase project (it rolls back; needs `npx supabase login` and `link`).
// Add --skip-slow to leave out the browser tests and Lighthouse. The summary table at the end is the result.
import { spawnSync } from 'node:child_process';

const live = process.argv.includes('--live');
const skipSlow = process.argv.includes('--skip-slow');
const steps = [
  { name: 'Code checker (ESLint)', cmd: 'npm run lint', must: true },
  { name: 'Unit and database-rule tests', cmd: 'npm test', must: true },
  { name: 'Production build', cmd: 'npm run build', must: true },
  { name: 'Dependency audit (npm audit)', cmd: 'npm audit --audit-level=high', must: true },
  { name: 'Browser tests, phone + desktop (Playwright, includes accessibility)', cmd: 'npm run test:e2e', must: true, slow: true },
  { name: 'Lighthouse (phone, slow network)', cmd: 'npm run test:lighthouse', must: false, slow: true },
  { name: 'Known gaps (expected to fail)', cmd: 'npm run test:gaps', must: false, informational: true },
  ...(live ? [{ name: 'Live database test (real Supabase, rolls back)', cmd: 'node scripts/live-e2e.mjs', must: true }] : []),
];

const results = [];
for (const step of steps) {
  if (skipSlow && step.slow) {
    results.push({ ...step, status: 'SKIPPED' });
    continue;
  }
  console.log(`\n=== ${step.name}\n    $ ${step.cmd}`);
  const started = Date.now();
  const r = spawnSync(step.cmd, { stdio: 'inherit', shell: true });
  const status = r.status === 0 ? 'PASS' : step.informational ? 'GAPS OPEN' : 'FAIL';
  results.push({ ...step, status, seconds: Math.round((Date.now() - started) / 1000) });
}
console.log('\n================ SUMMARY ================');
for (const r of results) console.log(`${r.status.padEnd(10)} ${r.name}${r.seconds !== undefined ? ` (${r.seconds}s)` : ''}`);
const failed = results.filter((r) => r.status === 'FAIL' && r.must);
console.log(failed.length ? `\n${failed.length} required step(s) FAILED.` : '\nAll required steps passed.');
process.exit(failed.length ? 1 : 0);
