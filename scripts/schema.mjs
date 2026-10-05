// Joins supabase/migrations/*.sql (in number order) and supabase/seed.sql into one paste-once file, supabase/schema.sql.
// The migrations are the source of truth. Run `npm run schema` after changing one; a test fails if you forget.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');

export function buildSchema() {
  const migrations = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  const header = [
    '-- =====================================================================',
    '-- Jobs Abroad - complete database setup for Supabase (GENERATED FILE: do not edit).',
    '-- Edit the numbered files in supabase/migrations instead, then run: npm run schema',
    '-- To set up a new project: Supabase dashboard > SQL Editor > New query > paste all > Run (once).',
    '-- =====================================================================',
    '',
  ].join('\n');
  const parts = migrations.map((f) => readFileSync(join(root, 'migrations', f), 'utf8').trim());
  parts.push(readFileSync(join(root, 'seed.sql'), 'utf8').trim());
  return `${header}\n${parts.join('\n\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(root, 'schema.sql'), buildSchema());
  console.log('wrote supabase/schema.sql');
}
