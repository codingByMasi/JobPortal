// Makes a person an admin (or takes it away) on the linked Supabase project.
//   node scripts/make-admin.mjs --list                    who has an account and who is admin
//   node scripts/make-admin.mjs person@example.com        make this person an admin
//   node scripts/make-admin.mjs person@example.com --remove   make them a normal employer again
// The person must already have signed up and confirmed their email. The change is written in the admin log.
// It runs one SQL statement on the project you linked with `npx supabase link`. It never prints a key.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const list = args.includes('--list');
const remove = args.includes('--remove');
const email = args.find((a) => !a.startsWith('--')) || '';

const run = (sql) => {
  const file = join(mkdtempSync(join(tmpdir(), 'admin-')), 'q.sql');
  writeFileSync(file, sql);
  const r = spawnSync(`npx supabase db query --linked -f "${file}" -o json`, { shell: true, encoding: 'utf8' });
  const text = r.stdout || '';
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).rows; } catch { console.error((r.stderr || text).split('\n').slice(-4).join('\n')); process.exit(1); }
};

if (list) {
  const rows = run("select u.email, u.email_confirmed_at is not null as confirmed, coalesce(p.role, '-') as role, coalesce(p.verified, false) as verified, coalesce(p.blocked, false) as blocked from auth.users u left join public.profiles p on p.id = u.id order by u.created_at");
  if (!rows.length) console.log('No accounts yet.');
  for (const r of rows) console.log(`${r.role.padEnd(10)} ${r.confirmed ? 'email confirmed' : 'EMAIL NOT CONFIRMED'}  ${r.blocked ? 'BLOCKED  ' : ''}${r.email}`);
  process.exit(0);
}

if (!/^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120}\.[A-Za-z]{2,}$/.test(email)) {
  console.error('Use: node scripts/make-admin.mjs person@example.com   (or --list, or add --remove)');
  process.exit(2);
}
const role = remove ? 'recruiter' : 'admin';
const found = run(`select u.id, u.email_confirmed_at is not null as confirmed, p.role, p.blocked from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower('${email}')`);
if (!found.length) { console.error(`No account for ${email}. The person must sign up on the site first.`); process.exit(1); }
if (!found[0].confirmed) { console.error('This account has not confirmed its email yet. Ask the person to open the email we sent.'); process.exit(1); }
if (found[0].blocked && !remove) { console.error('This account is blocked. Unblock it first (Admin > Employers).'); process.exit(1); }
if (found[0].role === role) { console.log(`${email} is already ${role}. Nothing changed.`); process.exit(0); }
run(`update public.profiles set role = '${role}' where id = '${found[0].id}'; insert into public.admin_log (admin_id, action, target_id, detail) values (null, '${remove ? 'remove_admin' : 'make_admin'}', '${found[0].id}', 'by script: ${email}'); select 1 as done;`);
const after = run(`select role from public.profiles where id = '${found[0].id}'`);
console.log(after[0]?.role === role ? `${email} is now ${role}.${remove ? '' : ' Next: log in, open Admin > Security and turn on two-step login.'}` : 'The change did not work. Check the project link.');
process.exit(after[0]?.role === role ? 0 : 1);
