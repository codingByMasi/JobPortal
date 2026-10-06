// SECURITY TESTS ON THE REAL DATABASE RULES.
// The real migrations run in a real Postgres (see rls/harness.mjs). Each test acts as a visitor, an employer or the admin
// and tries things it should (or should not) be allowed to do. This is the checklist from docs/03-database-security.md.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let blocked;           // user ids
let pkg7; let pkg30; let pkgFeatured; let pkgOff; // package ids
let live1; let ended; let hidden; let pending1; let e2pending; // job ids

const putFile = (owner, path) => db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [path, owner]);
const STORAGE_URL = (path) => `https://abc.supabase.co/storage/v1/object/public/job-files/${path}`;

async function seedJob(owner, title, status, packageId, startsDays, endsDays) {
  const { rows } = await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, status, starts_at, expires_at, whatsapp)
     values ($1, $2, $3, 'uae', 'Dubai', 'plumber', $4,
             case when $5::int is null then null else now() + make_interval(days => $5::int) end,
             case when $6::int is null then null else now() + make_interval(days => $6::int) end, '919999999999')
     returning id`,
    [owner, packageId, title, status, startsDays, endsDays],
  );
  return rows[0].id;
}

const newJob = (owner, o = {}) => ({ recruiter_id: owner, package_id: pkg30, title: 'My new ad', status: 'pending_payment', whatsapp: '919999999999', ...o });

/** Inserts a job as `who` using plain column names, so each test only states what it wants to try. */
function insertJob(who, row) {
  const cols = Object.keys(row);
  return as(db, who, () => db.query(
    `insert into public.jobs (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    cols.map((c) => row[c]),
  ));
}

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co', { company_name: 'Admin Co' });
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two' });
  blocked = await addUser(db, 'blocked@x.co', { company_name: 'Blocked Co' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  await db.query('update public.profiles set verified = true where id = $1', [e1]);
  await db.query('update public.profiles set blocked = true where id = $1', [blocked]);

  const id = async (name) => (await rowsOf(db, 'select id from public.packages where name = $1', [name]))[0].id;
  pkg7 = await id('7 Days');
  pkg30 = await id('30 Days');
  pkgFeatured = await id('30 Days Featured');
  pkgOff = (await db.query("insert into public.packages (name, price_paise, duration_days, active) values ('Old', 100, 5, false) returning id")).rows[0].id;

  live1 = await seedJob(e1, 'Live featured', 'live', pkgFeatured, -1, 29);
  ended = await seedJob(e1, 'Live but ended', 'live', pkg30, -30, -1);
  hidden = await seedJob(e1, 'Hidden', 'hidden', pkg30, -2, 20);
  pending1 = await seedJob(e1, 'Pending one', 'pending_payment', pkg30, null, null);
  e2pending = await seedJob(e2, 'Employer two pending', 'pending_payment', pkg7, null, null);

  await db.query("insert into public.payments (job_id, recruiter_id, amount_paise, note) values ($1, $2, 149900, 'e1 paid'), ($3, $4, 29900, 'e2 paid')", [live1, e1, e2pending, e2]);
  await db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9876543210')", [live1]);
}, 120000);

/* ------------------------------------------------------------------ */
describe('1. visitors (not logged in)', () => {
  it('see only live ads that have not ended, through the public view', async () => {
    const rows = await as(db, null, () => rowsOf(db, 'select id, title, featured, recruiter_verified from public.public_jobs'));
    expect(rows.map((r) => r.id)).toEqual([live1]);
    expect(rows[0]).toMatchObject({ featured: true, recruiter_verified: true });
  });
  it('the public view never shows who owns an ad or internal fields', async () => {
    const { fields } = await as(db, null, () => db.query('select * from public.public_jobs'));
    const names = fields.map((f) => f.name);
    for (const secret of ['recruiter_id', 'package_id', 'status', 'reject_reason', 'file_path']) expect(names).not.toContain(secret);
  });
  it('cannot write through the public view', async () => {
    for (const who of [null, e1]) {
      await denied(as(db, who, () => db.query("update public.public_jobs set title = 'hacked'")));
      await denied(as(db, who, () => db.query('delete from public.public_jobs')));
      await denied(as(db, who, () => db.query("insert into public.public_jobs (id, title) values (gen_random_uuid(), 'x')")));
    }
  });
  it('cannot read the jobs table at all (only the public view)', async () => {
    const rows = await as(db, null, () => rowsOf(db, 'select id from public.jobs'));
    expect(rows).toEqual([]); // visitors read ads only through the view, never the table (so owner ids are never exposed)
  });
  it('cannot read profiles, payments or applications', async () => {
    for (const table of ['profiles', 'payments', 'applications']) {
      expect(await as(db, null, () => countOf(db, `select * from public.${table}`))).toBe(0);
    }
  });
  it('can read packages (prices are public)', async () => {
    expect(await as(db, null, () => countOf(db, 'select * from public.packages'))).toBeGreaterThanOrEqual(3);
  });
  it('cannot create, change or delete ads, payments, packages or profiles', async () => {
    await denied(insertJob(null, newJob(e1)));
    await denied(as(db, null, () => db.query("insert into public.payments (recruiter_id, amount_paise) values ($1, 1)", [e1])));
    await denied(as(db, null, () => db.query("insert into public.packages (name, price_paise, duration_days) values ('x', 1, 1)")));
    await denied(as(db, null, () => db.query("insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')")));
    const upd = await as(db, null, () => db.query("update public.jobs set title = 'hacked'"));
    const del = await as(db, null, () => db.query('delete from public.jobs'));
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
  });
  it('cannot call admin functions or the expiry function', async () => {
    await denied(as(db, null, () => db.query('select public.admin_approve_job($1)', [pending1])));
    await denied(as(db, null, () => db.query('select public.admin_mark_paid($1)', [pending1])));
    await denied(as(db, null, () => db.query('select public.expire_jobs()')));
  });
});

describe('2. visitors applying', () => {
  const apply = (job, phone = '9000000001', name = 'Sita') =>
    as(db, null, () => db.query('insert into public.applications (job_id, name, phone) values ($1, $2, $3)', [job, name, phone]));

  it('can apply to a live ad', async () => {
    await expect(apply(live1, '9000000001')).resolves.toBeTruthy();
  });
  it('cannot apply to an ad that is hidden, ended, unpaid or does not exist', async () => {
    for (const job of [hidden, ended, pending1, '00000000-0000-0000-0000-00000000dead']) await denied(apply(job, '9000000002'));
  });
  it('cannot apply twice with the same phone, even written differently', async () => {
    await apply(live1, '98765 11111');
    const err = await denied(apply(live1, '+91 9876511111'));
    expect(err.code).toBe('23505');
  });
  it('can apply to a different ad, or with a different phone', async () => {
    await expect(apply(live1, '9876522222')).resolves.toBeTruthy();
  });
  it('is stopped by the checks on name and phone', async () => {
    await denied(apply(live1, 'abc', 'Bad Phone'));
    await denied(apply(live1, '123', 'Short Phone'));
    await denied(apply(live1, '9876533333', ''));
  });
  it('an ad stops taking applications after 1000', async () => {
    const full = await seedJob(e1, 'Busy ad', 'live', pkg30, -1, 20);
    await db.query(
      `insert into public.applications (job_id, name, phone)
       select $1, 'Bot ' || n, '9' || lpad(n::text, 9, '0') from generate_series(1, 1000) n`,
      [full],
    );
    const err = await denied(apply(full, '8000000000'));
    expect(err.code).toBe('54000');
  });
  it('visitors cannot read back what they sent', async () => {
    expect(await as(db, null, () => countOf(db, 'select * from public.applications'))).toBe(0);
  });
});

describe('3. an employer', () => {
  it('sees their own ads in every status, and nobody else\'s', async () => {
    const rows = await as(db, e1, () => rowsOf(db, 'select id, recruiter_id from public.jobs'));
    expect(rows.every((r) => r.recruiter_id === e1)).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([live1, ended, hidden, pending1]));
    expect(rows.map((r) => r.id)).not.toContain(e2pending);
  });

  it('can post an ad, which always starts as "waiting for payment" with no dates', async () => {
    const { rows } = await insertJob(e1, newJob(e1, { starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 9e9).toISOString(), reject_reason: 'x' }));
    const job = (await rowsOf(db, 'select * from public.jobs where id = $1', [rows[0].id]))[0];
    expect(job).toMatchObject({ status: 'pending_payment', starts_at: null, expires_at: null, reject_reason: null });
    expect(job.posted_date).toBeTruthy();
  });
  it('cannot post an ad as live, paid, or for someone else: whatever they ask, it is stored as THEIR ad "waiting for payment"', async () => {
    // The insert is corrected by a trigger before the permission check, so nothing dangerous can ever be stored.
    const asks = [{ status: 'live' }, { status: 'paid_pending_review' }, { status: 'hidden' }, { status: 'expired' }, { status: 'rejected' }, { recruiter_id: e2 }];
    for (const ask of asks) {
      const { rows } = await insertJob(e1, newJob(e1, { title: `Sneaky ${JSON.stringify(ask)}`, ...ask }));
      const [job] = await rowsOf(db, 'select recruiter_id, status, starts_at, expires_at from public.jobs where id = $1', [rows[0].id]);
      expect(job, JSON.stringify(ask)).toMatchObject({ recruiter_id: e1, status: 'pending_payment', starts_at: null, expires_at: null });
    }
    expect(await countOf(db, "select 1 from public.jobs where recruiter_id = $1 and title like 'Sneaky%'", [e2])).toBe(0);
  });
  it('needs an active package', async () => {
    await denied(insertJob(e1, newJob(e1, { package_id: pkgOff })));
    await denied(insertJob(e1, newJob(e1, { package_id: null })));
    await denied(insertJob(e1, newJob(e1, { package_id: '00000000-0000-0000-0000-00000000dead' })));
  });
  it('is held to valid country, category, WhatsApp and title', async () => {
    await denied(insertJob(e1, newJob(e1, { country: 'mars' })));
    await denied(insertJob(e1, newJob(e1, { category: 'wizard' })));
    await denied(insertJob(e1, newJob(e1, { whatsapp: 'call me' })));
    await denied(insertJob(e1, newJob(e1, { title: 'x' })));
  });
  it('the file link is built by the database: a typed-in link (any website, even one ending in our path) is replaced by ours', async () => {
    const path = `${e1}/ad1.jpg`;
    await putFile(e1, path);
    const own = STORAGE_URL(path);
    const stored = async (url) => (await rowsOf(db, 'select file_url from public.jobs where id = $1', [(await insertJob(e1, newJob(e1, { file_path: path, file_url: url }))).rows[0].id]))[0].file_url;
    expect(await stored(own)).toBe(own);
    expect(await stored('https://evil.example.com/tracking.png')).toBe(own);
    expect(await stored(`https://attacker.example.net/storage/v1/object/public/job-files/${path}`)).toBe(own); // the old hole
    expect(await stored('javascript:alert(1)')).toBe(own);
    expect(await stored('http://abc.supabase.co/x')).toBe(own);
  });
  it('a link without a file is dropped, and only a real file in the employer own folder can be attached', async () => {
    const path = `${e1}/ad2.jpg`;
    await putFile(e1, path);
    const { rows } = await insertJob(e1, newJob(e1, { file_path: null, file_url: 'https://evil.example.com/x.png' }));
    expect((await rowsOf(db, 'select file_url from public.jobs where id = $1', [rows[0].id]))[0].file_url).toBeNull();
    await putFile(e2, `${e2}/ad1.jpg`);
    await denied(insertJob(e1, newJob(e1, { file_path: `${e2}/ad1.jpg` }))); // someone else's file
    await denied(insertJob(e1, newJob(e1, { file_path: `${e1}/never-uploaded.jpg` }))); // file does not exist
    await denied(insertJob(e1, newJob(e1, { file_path: `${e1}/../${e2}/ad1.jpg` }))); // path trick
  });
  it('cannot swap the file of an ad for an outside link or another employer file while editing', async () => {
    const own = `${e1}/edit-me.jpg`;
    await putFile(e1, own);
    const { rows } = await insertJob(e1, newJob(e1, { title: 'Edit my file', file_path: own }));
    const edit = (set, ...params) => as(db, e1, () => db.query(`update public.jobs set ${set} where id = $1`, [rows[0].id, ...params]));
    const link = async () => (await rowsOf(db, 'select file_url from public.jobs where id = $1', [rows[0].id]))[0].file_url;
    await edit("file_url = 'https://evil.example.com/x.png'");
    expect(await link()).toBe(STORAGE_URL(own)); // a typed-in link is put back to ours
    expect((await denied(edit('file_path = $2', `${e2}/ad1.jpg`))).code).toBe('42501');
    expect((await denied(edit('file_path = $2', `${e1}/not-there.jpg`))).code).toBe('42501');
    const next = `${e1}/edit-me-2.jpg`;
    await putFile(e1, next);
    expect((await edit('file_path = $2', next)).affectedRows).toBe(1); // a proper replacement works
    expect(await link()).toBe(STORAGE_URL(next));
  });
  it('without the storage address setting, an ad with a file cannot be saved', async () => {
    const path = `${e1}/nosetting.jpg`;
    await putFile(e1, path);
    await db.query("delete from public.app_settings where key = 'storage_base'");
    try {
      await denied(insertJob(e1, newJob(e1, { file_path: path })));
    } finally {
      await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
    }
  });
  it('nobody can read or change the private settings from the browser', async () => {
    await denied(as(db, e1, () => db.query('select * from public.app_settings')));
    await denied(as(db, null, () => db.query("update public.app_settings set value = 'https://evil.example.com'")));
    await denied(as(db, e1, () => db.query("insert into public.app_settings (key, value) values ('x', 'y')")));
  });
  it('cannot keep more than 20 unpaid ads', async () => {
    const heavy = await addUser(db, 'heavy@x.co', { company_name: 'Heavy' });
    for (let i = 0; i < 20; i += 1) await insertJob(heavy, newJob(heavy, { title: `Ad number ${i}` }));
    const err = await denied(insertJob(heavy, newJob(heavy, { title: 'One too many' })));
    expect(err.code).toBe('53400');
  });

  it('can edit their own ad while it waits for payment', async () => {
    const r = await as(db, e1, () => db.query("update public.jobs set title = 'Better title', city = 'Doha' where id = $1", [pending1]));
    expect(r.affectedRows).toBe(1);
  });
  it('cannot change status, package, dates, owner, reason or posted date (even on their own waiting ad)', async () => {
    for (const change of ["status = 'live'", `package_id = '${pkg7}'`, "starts_at = now()", "expires_at = now() + interval '90 days'",
      `recruiter_id = '${e2}'`, "reject_reason = 'x'", "posted_date = '2020-01-01'", "status = 'paid_pending_review'"]) {
      const err = await denied(as(db, e1, () => db.query(`update public.jobs set ${change} where id = $1`, [pending1])));
      expect(err.code, change).toBe('42501');
    }
  });
  it('cannot edit an ad once it is paid, live, hidden or ended (the update touches nothing)', async () => {
    for (const job of [live1, ended, hidden]) {
      const r = await as(db, e1, () => db.query("update public.jobs set title = 'sneaky edit' where id = $1", [job]));
      expect(r.affectedRows).toBe(0);
    }
    expect(await countOf(db, "select 1 from public.jobs where title = 'sneaky edit'")).toBe(0);
  });
  it('cannot touch another employer\'s ads', async () => {
    const upd = await as(db, e1, () => db.query("update public.jobs set title = 'hijack' where id = $1", [e2pending]));
    const del = await as(db, e1, () => db.query('delete from public.jobs where id = $1', [e2pending]));
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
  });
  it('can delete their own unpaid, rejected or ended ads, but not a paid, live or hidden one', async () => {
    const del = (id) => as(db, e1, () => db.query('delete from public.jobs where id = $1', [id]));
    for (const [status, ok, a, b] of [['pending_payment', true, null, null], ['rejected', true, null, null], ['expired', true, -9, -1], ['live', true, -9, -1],
      ['live', false, -1, 5], ['hidden', false, -1, 5], ['paid_pending_review', false, null, null]]) {
      const id = await seedJob(e1, `To delete ${status}`, status, pkg30, a, b);
      expect((await del(id)).affectedRows).toBe(ok ? 1 : 0);
    }
  });

  it('can read only their own payments, and cannot write any', async () => {
    const notes = await as(db, e1, () => rowsOf(db, 'select note from public.payments'));
    expect(notes).toEqual([{ note: 'e1 paid' }]);
    await denied(as(db, e1, () => db.query("insert into public.payments (recruiter_id, amount_paise, note) values ($1, 0, 'free')", [e1])));
    expect((await as(db, e1, () => db.query("update public.payments set status = 'refunded'"))).affectedRows).toBe(0);
    expect((await as(db, e1, () => db.query('delete from public.payments'))).affectedRows).toBe(0);
  });
  it('can read applications only for their own ads', async () => {
    expect(await as(db, e1, () => countOf(db, 'select * from public.applications'))).toBeGreaterThan(0);
    expect(await as(db, e2, () => countOf(db, 'select * from public.applications'))).toBe(0);
    expect((await as(db, e1, () => db.query("update public.applications set name = 'x'"))).affectedRows).toBe(0);
    expect((await as(db, e1, () => db.query('delete from public.applications'))).affectedRows).toBe(0);
  });

  it('can change their own company name and phone, and see only their own profile', async () => {
    const r = await as(db, e1, () => db.query("update public.profiles set company_name = 'Renamed', phone = '9000000000' where id = $1", [e1]));
    expect(r.affectedRows).toBe(1);
    const visible = await as(db, e1, () => rowsOf(db, 'select id from public.profiles'));
    expect(visible).toEqual([{ id: e1 }]);
  });
  it('cannot put huge text in their profile', async () => {
    await denied(as(db, e1, () => db.query("update public.profiles set company_name = repeat('x', 500) where id = $1", [e1])));
    await denied(as(db, e1, () => db.query("update public.profiles set phone = repeat('9', 100) where id = $1", [e1])));
  });
  it('cannot make themselves admin, verified or unblocked, or change their email', async () => {
    const tries = [["role = 'admin'", e1], ['verified = true', e2], ['blocked = false', blocked], ["email = 'new@x.co'", e1]];
    for (const [change, who] of tries) {
      const err = await denied(as(db, who, () => db.query(`update public.profiles set ${change} where id = $1`, [who])));
      expect(err.code, change).toBe('42501');
    }
    expect(await countOf(db, "select 1 from public.profiles where role = 'admin'")).toBe(1);
  });
  it('cannot edit another employer\'s profile', async () => {
    const r = await as(db, e1, () => db.query("update public.profiles set company_name = 'hijack' where id = $1", [e2]));
    expect(r.affectedRows).toBe(0);
  });
  it('cannot use admin functions, change packages, or call the expiry function', async () => {
    await denied(as(db, e1, () => db.query('select public.admin_approve_job($1)', [pending1])));
    await denied(as(db, e1, () => db.query('select public.admin_mark_paid($1)', [pending1])));
    await denied(as(db, e1, () => db.query('select public.expire_jobs()')));
    await denied(as(db, e1, () => db.query("insert into public.packages (name, price_paise, duration_days) values ('free', 0, 1)")));
    expect((await as(db, e1, () => db.query('update public.packages set price_paise = 1'))).affectedRows).toBe(0);
  });
});

describe('4. file storage', () => {
  const upload = (who, path) => as(db, who, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [path, who]));

  it('an employer can upload and delete inside their own folder', async () => {
    await expect(upload(e1, `${e1}/a.jpg`)).resolves.toBeTruthy();
    const del = await as(db, e1, () => db.query("delete from storage.objects where name = $1", [`${e1}/a.jpg`]));
    expect(del.affectedRows).toBe(1);
  });
  it('cannot upload into someone else\'s folder or the bucket root, or into another bucket', async () => {
    await denied(upload(e1, `${e2}/a.jpg`));
    await denied(upload(e1, 'loose.jpg'));
    await denied(as(db, e1, () => db.query("insert into storage.objects (bucket_id, name) values ('other-bucket', $1)", [`${e1}/a.jpg`])));
  });
  it('cannot see or delete other people\'s files', async () => {
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [`${e2}/private.jpg`, e2]);
    expect(await as(db, e1, () => countOf(db, "select 1 from storage.objects where name like '%private.jpg'"))).toBe(0);
    const del = await as(db, e1, () => db.query("delete from storage.objects where name like '%private.jpg'"));
    expect(del.affectedRows).toBe(0);
  });
  it('visitors cannot upload, list or delete', async () => {
    await denied(upload(null, `${e1}/x.jpg`));
    expect(await as(db, null, () => countOf(db, 'select * from storage.objects'))).toBe(0);
  });
  it('a blocked employer cannot upload', async () => {
    await denied(upload(blocked, `${blocked}/a.jpg`));
  });
  it('stops an employer storing more than 100 files', async () => {
    const hoarder = await addUser(db, 'hoarder@x.co', {});
    await db.query("insert into storage.objects (bucket_id, name, owner) select 'job-files', $1 || '/f' || n || '.jpg', $1::uuid from generate_series(1, 100) n", [hoarder]);
    await denied(upload(hoarder, `${hoarder}/one-too-many.jpg`));
  });
  it('the bucket only takes JPG, PNG, WebP and PDF up to 3 MB, and is public by link', async () => {
    const [bucket] = await rowsOf(db, "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'job-files'");
    expect(bucket.public).toBe(true);
    expect(Number(bucket.file_size_limit)).toBe(3145728);
    expect([...bucket.allowed_mime_types].sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('5. a blocked employer', () => {
  it('cannot post an ad', async () => {
    const err = await denied(insertJob(blocked, newJob(blocked)));
    expect(err.code).toBe('42501');
  });
  it('cannot edit an ad they already had waiting for payment', async () => {
    const mine = await seedJob(blocked, 'Blocked waiting', 'pending_payment', pkg30, null, null);
    const r = await as(db, blocked, () => db.query("update public.jobs set title = 'still editing' where id = $1", [mine]));
    expect(r.affectedRows).toBe(0);
  });
});

describe('6. the admin', () => {
  it('can read everything', async () => {
    expect(await as(db, admin, () => countOf(db, 'select * from public.jobs'))).toBeGreaterThan(5);
    expect(await as(db, admin, () => countOf(db, 'select * from public.payments'))).toBe(2);
    expect(await as(db, admin, () => countOf(db, 'select * from public.profiles'))).toBeGreaterThanOrEqual(4);
    expect(await as(db, admin, () => countOf(db, 'select * from public.applications'))).toBeGreaterThan(0);
  });
  it('can approve an ad: live from now for the days of its package', async () => {
    const job = await seedJob(e1, 'To approve', 'paid_pending_review', pkg7, null, null);
    await as(db, admin, () => db.query('select public.admin_approve_job($1)', [job]));
    const [row] = await rowsOf(db, "select status, extract(epoch from (expires_at - starts_at)) / 86400 as days, reject_reason from public.jobs where id = $1", [job]);
    expect(row.status).toBe('live');
    expect(Number(row.days)).toBe(7);
  });
  it('approving an ad with no package gives 30 days; an unknown ad is an error', async () => {
    const job = await seedJob(e1, 'No package', 'paid_pending_review', null, null, null);
    await as(db, admin, () => db.query('select public.admin_approve_job($1)', [job]));
    const [row] = await rowsOf(db, 'select extract(epoch from (expires_at - starts_at)) / 86400 as days from public.jobs where id = $1', [job]);
    expect(Number(row.days)).toBe(30);
    await denied(as(db, admin, () => db.query('select public.admin_approve_job($1)', ['00000000-0000-0000-0000-00000000dead'])));
  });
  it('can mark an ad as paid: one payment record, ad moves to "waiting for approval", cannot be paid twice', async () => {
    const job = await seedJob(e2, 'To pay', 'pending_payment', pkg30, null, null);
    const before = await countOf(db, 'select * from public.payments');
    const [pay] = (await as(db, admin, () => db.query("select * from public.admin_mark_paid($1, null, 'UPI ref 1')", [job]))).rows;
    expect(pay).toMatchObject({ amount_paise: 79900, method: 'manual', status: 'paid', note: 'UPI ref 1', recruiter_id: e2 });
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [job]))[0].status).toBe('paid_pending_review');
    expect(await countOf(db, 'select * from public.payments')).toBe(before + 1);
    const err = await denied(as(db, admin, () => db.query('select public.admin_mark_paid($1)', [job])));
    expect(err.message).toMatch(/not waiting for payment/);
    expect(await countOf(db, 'select * from public.payments')).toBe(before + 1);
  });
  it('mark-as-paid locks the ad while it works (two admins cannot both record a payment)', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0009_abuse_limits.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/select \* into v_job from public\.jobs where id = p_job for update/);
  });
  it('refuses a negative amount', async () => {
    const job = await seedJob(e2, 'Negative', 'pending_payment', pkg30, null, null);
    await denied(as(db, admin, () => db.query('select * from public.admin_mark_paid($1, -5, $2)', [job, ''])));
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [job]))[0].status).toBe('pending_payment');
  });
  it('can mark paid with a different amount', async () => {
    const job = await seedJob(e2, 'Discount', 'pending_payment', pkg30, null, null);
    const [pay] = (await as(db, admin, () => db.query('select * from public.admin_mark_paid($1, 50000, $2)', [job, '']))).rows;
    expect(pay.amount_paise).toBe(50000);
  });
  it('can add payments, mark them refunded, change any ad, hide, reject and delete', async () => {
    await as(db, admin, () => db.query("insert into public.payments (recruiter_id, amount_paise, note) values ($1, 12345, 'cash')", [e1]));
    const refunded = await as(db, admin, () => db.query("update public.payments set status = 'refunded' where note = 'cash'"));
    expect(refunded.affectedRows).toBe(1);
    const job = await seedJob(e1, 'Admin plays', 'live', pkg30, -1, 20);
    expect((await as(db, admin, () => db.query("update public.jobs set title = 'Changed', status = 'hidden' where id = $1", [job]))).affectedRows).toBe(1);
    expect((await as(db, admin, () => db.query("update public.jobs set status = 'rejected', reject_reason = 'No phone' where id = $1", [job]))).affectedRows).toBe(1);
    expect((await as(db, admin, () => db.query('delete from public.jobs where id = $1', [job]))).affectedRows).toBe(1);
  });
  it('can add an ad that goes live at once', async () => {
    const { rows } = await insertJob(admin, { recruiter_id: admin, title: 'Admin ad', whatsapp: '919999999999', status: 'live', starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString() });
    expect((await as(db, null, () => countOf(db, 'select * from public.public_jobs where id = $1', [rows[0].id])))).toBe(1);
  });
  it('can verify and block employers, and manage packages', async () => {
    expect((await as(db, admin, () => db.query('update public.profiles set verified = true where id = $1', [e2]))).affectedRows).toBe(1);
    expect((await as(db, admin, () => db.query('update public.profiles set blocked = true where id = $1', [e2]))).affectedRows).toBe(1);
    await db.query('update public.profiles set blocked = false where id = $1', [e2]);
    await as(db, admin, () => db.query("insert into public.packages (name, price_paise, duration_days) values ('New', 49900, 10)"));
    expect((await as(db, admin, () => db.query("update public.packages set active = false where name = 'New'"))).affectedRows).toBe(1);
  });
  it('can use storage in any folder', async () => {
    await expect(as(db, admin, () => db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [`${admin}/x.pdf`, admin]))).resolves.toBeTruthy();
    expect((await as(db, admin, () => db.query("delete from storage.objects where name = $1", [`${e2}/private.jpg`]))).affectedRows).toBe(1);
  });
  it('still cannot call the expiry function from the browser', async () => {
    await denied(as(db, admin, () => db.query('select public.expire_jobs()')));
  });
});

describe('7. expiry and signup (run by the system, not by a person)', () => {
  it('the expiry function turns live ads past their end time into "expired", and leaves the rest', async () => {
    const before = await rowsOf(db, "select id, status from public.jobs where status <> 'live' or expires_at > now()");
    const [{ expire_jobs: changed }] = await rowsOf(db, 'select public.expire_jobs()');
    expect(changed).toBeGreaterThanOrEqual(1);
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [ended]))[0].status).toBe('expired');
    expect((await rowsOf(db, 'select status from public.jobs where id = $1', [live1]))[0].status).toBe('live');
    const after = await rowsOf(db, "select id, status from public.jobs where id = any($1::uuid[])", [before.map((b) => b.id)]);
    expect(after).toEqual(expect.arrayContaining(before));
  });
  it('signup always creates an employer, whatever the signup data says', async () => {
    const sneaky = await addUser(db, 'sneaky@x.co', { role: 'admin', verified: true, blocked: false, company_name: 'Sneaky' });
    const [p] = await rowsOf(db, 'select role, verified, blocked, company_name from public.profiles where id = $1', [sneaky]);
    expect(p).toEqual({ role: 'recruiter', verified: false, blocked: false, company_name: 'Sneaky' });
  });
  it('deleting a user removes their profile, ads and files links but keeps nothing orphaned', async () => {
    const temp = await addUser(db, 'temp@x.co', {});
    const job = await seedJob(temp, 'Temp ad', 'pending_payment', pkg30, null, null);
    await db.query('delete from auth.users where id = $1', [temp]);
    expect(await countOf(db, 'select 1 from public.profiles where id = $1', [temp])).toBe(0);
    expect(await countOf(db, 'select 1 from public.jobs where id = $1', [job])).toBe(0);
  });
});

describe('8. change requests (employers cannot edit paid ads, but can ask us)', () => {
  const ask = (who, jobId, message = 'Please change the phone number.', extra = {}) => as(db, who, () => {
    const row = { job_id: jobId, recruiter_id: who, message, ...extra };
    const cols = Object.keys(row);
    return db.query(`insert into public.change_requests (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, cols.map((c) => row[c]));
  });

  it('an employer can ask for a change on their own paid, live, hidden or ended ad', async () => {
    for (const job of [live1, hidden, ended]) await expect(ask(e1, job)).resolves.toBeTruthy();
  });
  it('not while the ad still waits for payment (they can just edit it), and not for someone else\'s ad', async () => {
    await denied(ask(e1, pending1));
    await denied(ask(e1, e2pending));
    await denied(ask(e2, live1));
  });
  it('whatever they send, it is stored as THEIR request and "open"', async () => {
    const { rows } = await ask(e1, live1, '  Change the city  ', { status: 'done', handled_at: '2020-01-01' });
    const [r] = await rowsOf(db, 'select recruiter_id, status, handled_at, message from public.change_requests where id = $1', [rows[0].id]);
    expect(r).toMatchObject({ recruiter_id: e1, status: 'open', handled_at: null, message: 'Change the city' });
    await denied(ask(e1, live1, 'x'.repeat(301)));
    await denied(ask(e1, live1, '  '));
  });
  it('at most 3 open requests per ad', async () => {
    const j = await seedJob(e1, 'Busy ad', 'live', pkg30, -1, 20);
    for (let i = 0; i < 3; i += 1) await ask(e1, j);
    expect((await denied(ask(e1, j))).code).toBe('53300');
  });
  it('a blocked employer cannot ask', async () => {
    const j = await seedJob(blocked, 'Blocked ad', 'live', pkg30, -1, 20);
    await denied(ask(blocked, j));
  });
  it('employers read only their own requests and cannot change or delete any', async () => {
    const mine = await as(db, e1, () => rowsOf(db, 'select recruiter_id from public.change_requests'));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.recruiter_id === e1)).toBe(true);
    const upd = await as(db, e1, () => db.query("update public.change_requests set status = 'done'"));
    expect(upd.affectedRows).toBe(0);
    const del = await as(db, e1, () => db.query('delete from public.change_requests'));
    expect(del.affectedRows).toBe(0);
  });
  it('visitors cannot read or write requests', async () => {
    expect(await as(db, null, () => countOf(db, 'select * from public.change_requests'))).toBe(0);
    await denied(as(db, null, () => db.query("insert into public.change_requests (job_id, recruiter_id, message) values ($1, $2, 'hello there')", [live1, e1])));
  });
  it('the admin reads all, and marking one done stamps the time', async () => {
    const all = await as(db, admin, () => rowsOf(db, 'select id, status from public.change_requests'));
    expect(all.length).toBeGreaterThan(3);
    const r = await as(db, admin, () => db.query("update public.change_requests set status = 'done' where id = $1 returning handled_at", [all[0].id]));
    expect(r.rows[0].handled_at).not.toBeNull();
  });
  it('deleting an ad removes its requests', async () => {
    const j = await seedJob(e2, 'Short lived', 'live', pkg30, -1, 20);
    await ask(e2, j);
    await db.query('delete from public.jobs where id = $1', [j]);
    expect(await countOf(db, 'select 1 from public.change_requests where job_id = $1', [j])).toBe(0);
  });
});
