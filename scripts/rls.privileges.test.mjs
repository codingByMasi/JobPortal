// SECURITY TESTS, PART 21: least privilege (migration 0037). The exact rights the website's two database roles hold on every table and view.
// Row Level Security is still the second lock; this is the first one. A new table must be added here on purpose, with exactly the rights its policies need.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let owner; let pkg30; let job;

const TABLE_RIGHTS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];

/** { table: 'delete,insert,select,update' } for every table and view in public that the role has any right on. */
async function rightsOf(role) {
  const out = {};
  for (const { name } of await rowsOf(db, "select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1")) {
    const have = [];
    for (const r of TABLE_RIGHTS) {
      if ((await rowsOf(db, `select has_table_privilege($1, 'public.${name}', $2) as ok`, [role, r.toUpperCase()]))[0].ok) have.push(r);
    }
    if (have.length) out[name] = have.sort().join(',');
  }
  return out;
}

const FULL = 'delete,insert,select,update';

// What visitors may do: read the two public views and the public settings, and only ADD forms.
const ANON = {
  applications: 'insert', deletion_requests: 'insert', reports: 'insert',
  public_jobs: 'select', site_settings: 'select', verified_agencies: 'select',
};
// What signed-in people (employers and admins) may do; Row Level Security then decides which rows.
const AUTHENTICATED = {
  ad_views: 'select', admin_log: 'select', audit_log: 'select', guides: 'select', notifications: 'select', verification_requests: 'select',
  public_jobs: 'select', site_settings: 'select', verified_agencies: 'select', file_cleanup_queue: 'delete,select',
  applications: FULL, blocked_contacts: FULL, change_requests: FULL, deletion_requests: FULL, error_log: FULL, jobs: FULL,
  offer_redemptions: FULL, offers: FULL, packages: FULL, payments: FULL, profiles: FULL, reports: FULL,
};

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co') on conflict (key) do nothing");
  owner = await addUser(db, 'owner@x.co', { company_name: 'Gulf Works', phone: '9876500001' });
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  job = (await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, company, country, city, category, whatsapp, status, starts_at, expires_at)
     values ($1, $2, 'Live ad', 'Gulf Works', 'uae', 'Dubai', 'plumber', '919999999999', 'live', now() - interval '1 day', now() + interval '20 days') returning id`, [owner, pkg30])).rows[0].id;
}, 120000);

describe('37. least privilege (migration 0037)', () => {
  it('visitors hold exactly these rights and no others', async () => {
    expect(await rightsOf('anon')).toEqual(ANON);
  });

  it('signed-in people hold exactly these rights and no others (never TRUNCATE, REFERENCES or TRIGGER; the two views and the two logs are read only)', async () => {
    expect(await rightsOf('authenticated')).toEqual(AUTHENTICATED);
  });

  it('the closed tables are closed to both website roles (alerts, passes and settings are only for database and Edge Functions)', async () => {
    for (const role of ['anon', 'authenticated']) {
      const rights = await rightsOf(role);
      for (const table of ['alert_outbox', 'app_settings', 'human_passes', 'job_alerts']) expect(rights, `${role} on ${table}`).not.toHaveProperty(table);
    }
  });

  it('TRUNCATE is refused for everyone on the website side, even though Row Level Security does not check it', async () => {
    for (const who of [null, owner]) {
      for (const table of ['jobs', 'payments', 'profiles', 'applications', 'admin_log', 'reports']) {
        await denied(as(db, who, () => db.query(`truncate table public.${table}`)));
      }
    }
    expect(await countOf(db, 'select * from public.jobs')).toBeGreaterThan(0);
  });

  it('the two public views cannot be written by anyone on the website side', async () => {
    for (const who of [null, owner]) {
      await denied(as(db, who, () => db.query("insert into public.verified_agencies (company_name) values ('Fake Agency')")));
      await denied(as(db, who, () => db.query("update public.public_jobs set title = 'hacked'")));
      await denied(as(db, who, () => db.query('delete from public.public_jobs')));
    }
  });

  it('a signed-in person cannot write the logs by hand (only database functions do)', async () => {
    await denied(as(db, owner, () => db.query("insert into public.admin_log (action) values ('forged')")));
    await denied(as(db, owner, () => db.query("insert into public.audit_log (action, table_name) values ('x', 'y')")));
    expect(await countOf(db, "select * from public.admin_log where action = 'forged'")).toBe(0);
  });

  it('the forms visitors fill in still work, as long as they do not ask the database to send the saved row back', async () => {
    await as(db, null, () => db.query("insert into public.applications (job_id, name, phone) values ($1, 'Seeker', '9833300001')", [job]));
    await as(db, null, () => db.query("insert into public.reports (job_id, reason, message, contact) values ($1, 'other', 'x', '')", [job]));
    await as(db, null, () => db.query("insert into public.deletion_requests (email, note) values ('a@x.co', 'please')"));
    // asking for the row back needs the right to read it, which visitors do not have (the website's forms must not use .select() after .insert())
    for (const sql of [
      "insert into public.applications (job_id, name, phone) values ('%JOB%', 'Seeker', '9833300002') returning id",
      "insert into public.reports (job_id, reason, message, contact) values ('%JOB%', 'other', 'y', '') returning id",
      "insert into public.deletion_requests (email, note) values ('b@x.co', 'please') returning id",
    ]) await denied(as(db, null, () => db.query(sql.replace('%JOB%', job))));
  });

  it('a table made from now on gives no rights to anyone by itself (it must be granted on purpose)', async () => {
    await db.query('create table public.zz_future_table (id integer)');
    await db.query('alter table public.zz_future_table enable row level security');
    const rights = { anon: await rightsOf('anon'), authenticated: await rightsOf('authenticated') };
    await db.query('drop table public.zz_future_table');
    expect(rights.anon).not.toHaveProperty('zz_future_table');
    expect(rights.authenticated).not.toHaveProperty('zz_future_table');
  });
});
