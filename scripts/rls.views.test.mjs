// SECURITY TESTS, PART 18: ad view counters and the employer's per-ad numbers (migration 0033).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30; let live; let waiting; let ended;

const ad = async (owner, title, status, endsDays) => (await db.query(
  `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status, starts_at, expires_at)
   values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999', $4, now() - interval '1 day', now() + make_interval(days => $5::int)) returning id`, [owner, pkg30, title, status, endsDays])).rows[0].id;
const view = (who, id) => as(db, who, () => db.query('select public.record_ad_view($1)', [id]));
const stats = (who) => as(db, who, () => db.query('select * from public.my_ad_stats()')).then((r) => Object.fromEntries(r.rows.map((x) => [x.job_id, { views: Number(x.views), applications: Number(x.applications) }])));

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  live = await ad(e1, 'Live ad', 'live', 10);
  waiting = await ad(e1, 'Waiting ad', 'paid_pending_review', 10);
  ended = await ad(e1, 'Ended ad', 'live', -2);
}, 120000);

describe('32. ad views and the employer\'s numbers (migration 0033)', () => {
  it('a visitor can count a view on a live ad, again and again, and it adds up', async () => {
    await view(null, live);
    await view(null, live);
    await view(e2, live); // a logged-in person too
    expect((await rowsOf(db, 'select sum(views)::int n from public.ad_views where job_id = $1', [live]))[0].n).toBe(3);
  });

  it('views of an ad that is not live (waiting, ended, unknown) are not counted and cause no error', async () => {
    await view(null, waiting);
    await view(null, ended);
    await view(null, '00000000-0000-0000-0000-00000000dead');
    expect(await countOf(db, 'select * from public.ad_views where job_id = any($1)', [[waiting, ended]])).toBe(0);
  });

  it('only a number is stored: the table has no visitor column', async () => {
    const cols = (await rowsOf(db, "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ad_views' order by 1")).map((c) => c.column_name);
    expect(cols).toEqual(['day', 'job_id', 'views']);
  });

  it('views are counted per day', async () => {
    await db.query("insert into public.ad_views (job_id, day, views) values ($1, current_date - 1, 5)", [live]);
    expect((await stats(e1))[live].views).toBe(8);
  });

  it('the employer sees views and applications for their own ads only', async () => {
    await db.query("insert into public.applications (job_id, name, phone) values ($1, 'Ram', '9811100001'), ($1, 'Sita', '9811100002')", [live]);
    const mine = await stats(e1);
    expect(mine[live]).toEqual({ views: 8, applications: 2 });
    expect(mine[waiting]).toEqual({ views: 0, applications: 0 });
    expect(Object.keys(mine).sort()).toEqual([live, waiting, ended].sort());
    expect(await stats(e2)).toEqual({}); // another employer sees nothing of it
  });

  it('nobody writes the counters directly; only an admin can read the table; a visitor cannot ask for the stats', async () => {
    await denied(as(db, e1, () => db.query("insert into public.ad_views (job_id, views) values ($1, 100000)", [live])));
    await denied(as(db, e1, () => db.query('update public.ad_views set views = 0')));
    expect(await as(db, e1, () => countOf(db, 'select * from public.ad_views'))).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.ad_views'))).toBeGreaterThan(0);
    await denied(as(db, null, () => db.query('select * from public.my_ad_stats()')));
  });

  it('deleting an ad removes its counters', async () => {
    const gone = await ad(e1, 'Delete me', 'live', 10);
    await view(null, gone);
    await db.query('delete from public.jobs where id = $1', [gone]);
    expect(await countOf(db, 'select * from public.ad_views where job_id = $1', [gone])).toBe(0);
  });
});
