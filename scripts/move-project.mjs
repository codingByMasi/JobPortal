// Moves the app to a NEW, EMPTY Supabase project (for example from Seoul to Mumbai). Use: node scripts/move-project.mjs <new-project-ref>
// Needs: `npx supabase login` done, and the new project's database password in the environment variable SUPABASE_DB_PASSWORD.
// What it does, in order: links the new project, runs every migration, loads the sample plans, tells the database its own storage address,
// writes the new address and public key into .env, then runs the live test (98 checks, rolled back). It never prints a key or password.
// It does NOT touch the old project and does NOT copy data (the old project has no real data; for real data use a dump and restore).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ref = process.argv[2];
const password = process.env.SUPABASE_DB_PASSWORD;
if (!/^[a-z]{20}$/.test(ref || '') || !password) {
  console.error('Use: SUPABASE_DB_PASSWORD=... node scripts/move-project.mjs <new-project-ref (20 letters)>');
  process.exit(2);
}

const run = (title, cmd, { secret = false } = {}) => {
  console.log(`\n== ${title}`);
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', env: { ...process.env, SUPABASE_DB_PASSWORD: password } });
  const text = `${r.stdout || ''}${r.stderr || ''}`.split(password).join('[hidden]');
  if (!secret) console.log(text.trim().split('\n').slice(-12).join('\n'));
  if (r.status !== 0) {
    console.error(`\nSTOPPED at: ${title}`);
    process.exit(1);
  }
  return r.stdout || '';
};

run('Link the new project', `npx supabase link --project-ref ${ref} --password "${password}"`);
run('Run every migration (0001 to the latest)', `npx supabase db push --linked --password "${password}" --yes`);
run('Load the sample plans', 'npx supabase db query --linked -f supabase/seed.sql');
run('Tell the database its own storage address', `npx supabase db query --linked "insert into public.app_settings (key, value) values ('storage_base', 'https://${ref}.supabase.co') on conflict (key) do update set value = excluded.value"`);

// the public (anon) key goes into .env; it is safe in the browser but is still not printed
const keys = JSON.parse(run('Read the public key', `npx supabase projects api-keys --project-ref ${ref} -o json`, { secret: true }));
const anon = (Array.isArray(keys) ? keys : []).find((k) => k.name === 'anon' || k.id === 'anon') || (Array.isArray(keys) ? keys : []).find((k) => /publishable/i.test(k.type || k.name || ''));
if (!anon?.api_key) {
  console.error('Could not find the public key. Copy it from the Supabase dashboard (Project settings > API Keys) into .env by hand.');
  process.exit(1);
}
let env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const put = (name, value) => {
  const line = `${name}=${value}`;
  env = new RegExp(`^${name}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
};
put('VITE_SUPABASE_URL', `https://${ref}.supabase.co`);
put('VITE_SUPABASE_ANON_KEY', anon.api_key);
writeFileSync('.env', env);
console.log('\n== .env now points to the new project (the key was not printed).');

run('Live test on the new project (rolls back, 98 checks)', 'node scripts/live-e2e.mjs');
console.log(`\nDONE. The new project is https://${ref}.supabase.co. Next: set the Auth settings in its dashboard and the two values in Cloudflare (docs/06-deploy.md).`);
