// Runs scripts/live-e2e.sql on the LINKED Supabase project and prints one line per check.
// Needs: `npx supabase login` and `npx supabase link --project-ref <your project>` done once. Nothing is kept in the project (everything rolls back).
// Usage: node scripts/live-e2e.mjs            (add  --json  to print the raw results)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('./live-e2e.sql', import.meta.url));
const run = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${file}"`], { encoding: 'utf8', shell: true, maxBuffer: 20 * 1024 * 1024 });
const text = `${run.stdout || ''}${run.stderr || ''}`;

/** The test ends with an error that carries the results; take them out of it. */
export function readResults(output) {
  const start = output.indexOf('{');
  const outer = JSON.parse(output.slice(start, output.lastIndexOf('}') + 1)); // ignore progress lines before or after the JSON
  const message = outer.error?.message || '';
  const inner = JSON.parse(message.slice(message.indexOf('{'), message.lastIndexOf('}') + 1)).message;
  return JSON.parse(inner.slice(inner.indexOf('['), inner.lastIndexOf(']') + 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let results;
  try {
    results = readResults(text);
  } catch {
    console.error('The live test did not finish. Is the CLI logged in and linked? Output:\n', text.slice(0, 1500));
    process.exit(2);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1));
  let area = '';
  for (const r of results) {
    if (r.area !== area) {
      area = r.area;
      console.log(`\n${area}`);
    }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.test}${r.ok ? '' : `   (expected: ${r.expect} | got: ${r.actual})`}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}
