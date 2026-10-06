// RELEASE-READINESS DATABASE TESTS: guards that look at the WHOLE database, so a new table or function cannot quietly open a door.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let a; let b; let pkg30; let live;

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  a = await addUser(db, 'a@x.co', { company_name: 'A Co', phone: '9876500001' });
  b = await addUser(db, 'b@x.co', { company_name: 'B Co', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  live = (await db.query(`insert into public.jobs (recruiter_id, package_id, title, whatsapp, status, starts_at, expires_at)
    values ($1, $2, 'Live ad', '919999999999', 'live', now() - interval '1 day', now() + interval '9 days') returning id`, [a, pkg30])).rows[0].id;
  await db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9811100001')", [live]);
  await db.query('insert into public.payments (job_id, recruiter_id, amount_paise) values ($1, $2, 79900)', [live, a]);
  await db.query("insert into public.change_requests (job_id, recruiter_id, message) values ($1, $2, 'Please change')", [live, a]);
  await db.query("insert into public.error_log (message) values ('crash')");
  await db.query("insert into public.blocked_contacts (phone_last10) values ('1234567890')");
  await db.query("insert into public.admin_log (action) values ('x')");
}, 120000);

const tablesAndViews = async () => (await rowsOf(db, `
  select c.relname as name, c.relkind as kind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1`));

describe('whole-database guards', () => {
  it('a visitor can read rows from ONLY the packages table and the public_jobs view, and nowhere else', async () => {
    const readable = [];
    for (const { name } of await tablesAndViews()) {
      try {
        const n = await as(db, null, () => countOf(db, `select * from public.${name}`));
        if (n > 0) readable.push(name);
      } catch {
        /* permission denied: fine */
      }
    }
    expect(readable.sort()).toEqual(['packages', 'public_jobs']);
  });

  it('an employer sees rows only from their own data plus packages and the public list', async () => {
    const seen = {};
    for (const { name } of await tablesAndViews()) {
      try {
        seen[name] = await as(db, b, () => countOf(db, `select * from public.${name}`));
      } catch {
        seen[name] = 'denied';
      }
    }
    // employer B owns nothing: B may see the public list and packages, plus B's own profile - never A's rows
    expect(seen.jobs).toBe(0);
    expect(seen.payments).toBe(0);
    expect(seen.applications).toBe(0);
    expect(seen.change_requests).toBe(0);
    expect(seen.error_log).toBe(0);
    expect(seen.admin_log).toBe(0);
    expect(seen.blocked_contacts).toBe(0);
    expect(seen.profiles).toBe(1);
    expect(['denied', 0]).toContain(seen.app_settings);
  });

  it('every table in the public schema has Row Level Security switched on', async () => {
    const off = await rowsOf(db, `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(off).toEqual([]);
  });

  it('visitors may call only these functions (an allow-list: a new function must be added here on purpose; phone_last10 is a pure text helper)', async () => {
    const fns = await rowsOf(db, `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`);
    const allowed = fns.filter((f) => f.anon).map((f) => f.proname);
    expect(allowed.sort()).toEqual(['is_admin', 'is_blocked', 'job_accepts_applications', 'log_client_error', 'phone_last10']);
  });

  it('signed-in employers may call only these functions (admin functions refuse non-admins on their own)', async () => {
    const fns = await rowsOf(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`);
    expect(fns.map((f) => f.proname)).toEqual([
      'admin_approve_job', 'admin_mark_paid', 'admin_refund_payment', 'admin_reject_job', 'admin_set_hidden',
      'count_my_applications', 'employer_may_see_applicants', 'is_admin', 'is_blocked', 'job_accepts_applications', 'log_client_error', 'phone_last10',
    ]);
  });

  it('no other login can read, change or delete another employer\'s ads, payments, requests or applications', async () => {
    for (const sql of [
      `select count(*)::int n from public.jobs where id = '${live}'`,
      'select count(*)::int n from public.payments',
      'select count(*)::int n from public.change_requests',
      'select count(*)::int n from public.applications',
    ]) {
      expect((await as(db, b, () => db.query(sql))).rows[0].n, sql).toBe(0);
    }
    expect((await as(db, b, () => db.query("update public.jobs set title = 'hijack' where id = $1", [live]))).affectedRows).toBe(0);
    expect((await as(db, b, () => db.query('delete from public.jobs where id = $1', [live]))).affectedRows).toBe(0);
  });
});

describe('file storage', () => {
  const put = (who, path) => as(db, who, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [path, who]));

  it('an employer cannot overwrite, rename or delete another employer\'s file', async () => {
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [`${a}/theirs.jpg`, a]);
    expect((await as(db, b, () => db.query("update storage.objects set name = $2 where name = $1", [`${a}/theirs.jpg`, `${b}/stolen.jpg`]))).affectedRows).toBe(0);
    expect((await as(db, b, () => db.query("update storage.objects set owner = $2 where name = $1", [`${a}/theirs.jpg`, b]))).affectedRows).toBe(0);
    expect((await as(db, b, () => db.query('delete from storage.objects where name = $1', [`${a}/theirs.jpg`]))).affectedRows).toBe(0);
    await denied(put(b, `${a}/planted.jpg`));
    expect(await countOf(db, "select * from storage.objects where name = $1", [`${a}/theirs.jpg`])).toBe(1);
  });

  it('an employer cannot change their own file in place either (they upload a new one and the old one is removed by the app)', async () => {
    await put(a, `${a}/mine.jpg`);
    expect((await as(db, a, () => db.query("update storage.objects set name = $2 where name = $1", [`${a}/mine.jpg`, `${a}/renamed.jpg`]))).affectedRows).toBe(0);
  });

  it('the bucket takes only JPG, PNG, WebP and PDF, up to 3 MB, and is public only by link', async () => {
    const [bucket] = await rowsOf(db, "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'job-files'");
    expect(bucket.public).toBe(true);
    expect(Number(bucket.file_size_limit)).toBe(3 * 1024 * 1024);
    expect([...bucket.allowed_mime_types].sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    expect(await as(db, null, () => countOf(db, 'select * from storage.objects'))).toBe(0); // no listing for visitors
  });
});

describe('ads that ended', () => {
  it('an ad past its end time disappears from the public list at once, even if its status still says live', async () => {
    const id = (await db.query(`insert into public.jobs (recruiter_id, package_id, title, whatsapp, status, starts_at, expires_at)
      values ($1, $2, 'Ended yesterday', '919999999999', 'live', now() - interval '30 days', now() - interval '1 day') returning id`, [a, pkg30])).rows[0].id;
    expect(await as(db, null, () => countOf(db, 'select * from public.public_jobs where id = $1', [id]))).toBe(0);
    await expect(as(db, null, () => db.query("insert into public.applications (job_id, name, phone) values ($1, 'Late', '9811100099')", [id]))).rejects.toBeTruthy();
  });
});
