// Publishes the guides from docs/ into the database, where only admins can read them (Admin > Guides).
//   node scripts/publish-guides.mjs            writes to the linked Supabase project
//   node scripts/publish-guides.mjs --dry-run  only shows what would be written
// Run it again whenever a guide in docs/ changes. It only writes the table `guides` (four rows) and prints no secret.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GUIDES = [
  { slug: 'admin-guide', file: 'docs/10-admin-guide.md', order: 1 },
  { slug: 'employer-guide', file: 'docs/16-employer-guide.md', order: 2 },
  { slug: 'job-seeker-guide', file: 'docs/17-job-seeker-guide.md', order: 3 },
  { slug: 'app-features', file: 'docs/18-app-features.md', order: 4 },
];
const dry = process.argv.includes('--dry-run');

const statements = GUIDES.map((g) => {
  const body = readFileSync(g.file, 'utf8').replace(/\r\n/g, '\n').trim();
  const title = (/^#\s+(?:\d+\s*-\s*)?(.+)$/m.exec(body)?.[1] || g.slug).replace(/'/g, "''").slice(0, 120);
  if (body.includes('$guide$')) throw new Error(`${g.file} contains the text $guide$`);
  console.log(`${g.slug.padEnd(17)} ${String(body.length).padStart(6)} letters  "${title}"`);
  return `insert into public.guides (slug, title, body, sort_order, updated_at) values ('${g.slug}', '${title}', $guide$${body}$guide$, ${g.order}, now())
    on conflict (slug) do update set title = excluded.title, body = excluded.body, sort_order = excluded.sort_order, updated_at = now();`;
});
if (dry) process.exit(0);

const file = join(mkdtempSync(join(tmpdir(), 'guides-')), 'publish.sql');
writeFileSync(file, `${statements.join('\n')}\nselect count(*) as n from public.guides;`);
const r = spawnSync(`npx supabase db query --linked -f "${file}" -o json`, { shell: true, encoding: 'utf8' });
const out = r.stdout || '';
try {
  const n = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).rows[0].n;
  console.log(`Published. The project now holds ${n} guides.`);
} catch {
  console.error((r.stderr || out).split('\n').slice(-5).join('\n'));
  process.exit(1);
}
