// Safe way to put a new migration on the LINKED Supabase project:
//   node scripts/live-apply.mjs supabase/migrations/0017_something.sql
// 1. runs all local tests (stops here if any fail: nothing is sent to the live project),
// 2. applies the file, 3. runs the 85-check live test and tells you if anything broke.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('Usage: node scripts/live-apply.mjs supabase/migrations/<file>.sql');
  process.exit(2);
}
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: true });

console.log('1/3 local tests...');
if (run('npm', ['test']).status !== 0) {
  console.error('\nSTOPPED: local tests failed. Nothing was sent to the live project.');
  process.exit(1);
}
console.log(`\n2/3 applying ${file} to the linked project...`);
if (run('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${file}"`]).status !== 0) {
  console.error('\nSTOPPED: the live project refused the file. Read the message above.');
  process.exit(1);
}
console.log('\n3/3 live test (85 checks, everything rolls back)...');
if (run('node', ['scripts/live-e2e.mjs']).status !== 0) {
  console.error('\nWARNING: the live test found a problem AFTER the change. Fix or undo the migration now.');
  process.exit(1);
}
console.log('\nDone: local tests and live test both pass.');
