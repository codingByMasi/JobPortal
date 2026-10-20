// SECURITY TESTS, PART 19: job alerts (migration 0035): sign-up limits, confirm, daily digest, unsubscribe, and what visitors may not touch.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let owner; let pkg30;

const sub = (who, email, country = null, category = null, lang = 'en') => as(db, who, () => db.query('select public.subscribe_job_alert($1, $2, $3, $4)', [email, country, category, lang]));
const alertOf = async (email, country = null, category = null) => (await rowsOf(db, "select * from public.job_alerts where email = $1 and coalesce(country,'') = coalesce($2,'') and coalesce(category,'') = coalesce($3,'')", [email, country, category]))[0];
const ad = async (title, country, category, startedHoursAgo, { status = 'live', endsDays = 20 } = {}) => (await db.query(
  `insert into public.jobs (recruiter_id, package_id, title, company, country, city, category, whatsapp, status, starts_at, expires_at)
   values ($1, $2, $3, 'Gulf Works', $4, 'Dubai', $5, '919999999999', $6, now() - make_interval(hours => $7::int), now() + make_interval(days => $8::int)) returning id`,
  [owner, pkg30, title, country, category, status, startedHoursAgo, endsDays])).rows[0].id;
const confirm = (token) => as(db, null, () => db.query('select public.confirm_job_alert($1) as ok', [token])).then((r) => r.rows[0].ok);
const digests = async (email) => rowsOf(db, "select o.* from public.alert_outbox o join public.job_alerts a on a.id = o.alert_id where a.email = $1 and o.kind = 'digest' order by o.created_at", [email]);

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  owner = await addUser(db, 'owner@x.co', { company_name: 'Gulf Works', phone: '9876500001' });
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('33. signing up for job alerts', () => {
  it('a visitor can sign up; the email is cleaned, the alert waits for confirmation and one confirm mail is queued', async () => {
    await sub(null, '  Seeker@Example.COM ', 'uae', 'plumber', 'hi');
    const a = await alertOf('seeker@example.com', 'uae', 'plumber');
    expect(a).toMatchObject({ email: 'seeker@example.com', country: 'uae', category: 'plumber', lang: 'hi', confirmed_at: null });
    expect(await countOf(db, "select * from public.alert_outbox where alert_id = $1 and kind = 'confirm'", [a.id])).toBe(1);
  });

  it('the same alert again changes nothing visible, and sends the confirm mail again only after an hour', async () => {
    await sub(null, 'seeker@example.com', 'uae', 'plumber');
    expect(await countOf(db, "select * from public.job_alerts where email = 'seeker@example.com'")).toBe(1);
    const a = await alertOf('seeker@example.com', 'uae', 'plumber');
    expect(await countOf(db, "select * from public.alert_outbox where alert_id = $1", [a.id])).toBe(1);
    await db.query("update public.alert_outbox set created_at = now() - interval '2 hours' where alert_id = $1", [a.id]);
    await sub(null, 'seeker@example.com', 'uae', 'plumber');
    expect(await countOf(db, "select * from public.alert_outbox where alert_id = $1", [a.id])).toBe(2);
  });

  it('wrong emails, countries and kinds of work are refused', async () => {
    for (const bad of ['', 'nobody', 'a@b', 'two words@x.co', `${'x'.repeat(130)}@x.co`]) await denied(sub(null, bad));
    await denied(sub(null, 'ok@x.co', 'mars'));
    await denied(sub(null, 'ok@x.co', null, 'pilot'));
    expect(await countOf(db, "select * from public.job_alerts where email = 'ok@x.co'")).toBe(0);
  });

  it('at most 5 alerts per email, and at most 300 new alerts per hour in total', async () => {
    for (const c of ['uae', 'saudi', 'qatar', 'kuwait', 'oman']) await sub(null, 'many@x.co', c);
    const error = await denied(sub(null, 'many@x.co', 'others'));
    expect(error.message).toMatch(/5 alerts/);
    await db.query("insert into public.job_alerts (email) select 'bulk' || g || '@x.co' from generate_series(1, 300) g");
    await denied(sub(null, 'late@x.co'));
    await db.query("delete from public.job_alerts where email like 'bulk%'");
    await sub(null, 'late@x.co'); // fine again
  });

  it('visitors and logged-in users cannot read or write the alert tables, or call the sender functions', async () => {
    for (const who of [null, owner]) {
      await denied(as(db, who, () => db.query('select * from public.job_alerts')));
      await denied(as(db, who, () => db.query("insert into public.job_alerts (email) values ('x@x.co')")));
      await denied(as(db, who, () => db.query('select * from public.alert_outbox')));
      await denied(as(db, who, () => db.query('select * from public.claim_alert_mail(10)')));
      await denied(as(db, who, () => db.query('select public.queue_alert_digests()')));
      await denied(as(db, who, () => db.query('select public.purge_job_alerts()')));
      await denied(as(db, who, () => db.query("select public.mark_alert_mail_sent('00000000-0000-0000-0000-000000000000')")));
      await denied(as(db, who, () => db.query("select public.mark_alert_mail_failed('00000000-0000-0000-0000-000000000000', 'x')")));
    }
  });
});

describe('34. confirming, the daily digest, and the sender', () => {
  it('an unconfirmed alert gets no digest; confirming works with the right token only, and twice is fine', async () => {
    await sub(null, 'digest@x.co', 'uae', 'plumber');
    const a = await alertOf('digest@x.co', 'uae', 'plumber');
    await ad('Plumber one', 'uae', 'plumber', 1);
    await db.query('select public.queue_alert_digests()');
    expect(await digests('digest@x.co')).toHaveLength(0);
    expect(await confirm('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect((await alertOf('digest@x.co', 'uae', 'plumber')).confirmed_at).toBeNull();
    expect(await confirm(a.token)).toBe(true);
    expect((await alertOf('digest@x.co', 'uae', 'plumber')).confirmed_at).not.toBeNull();
    expect(await confirm(a.token)).toBe(true);
  });

  it('only ads that started after confirming, that are live, and that match the alert go in the digest; each ad is sent once', async () => {
    const email = 'match@x.co';
    await sub(null, email, 'uae', 'driver');
    const a = await alertOf(email, 'uae', 'driver');
    await ad('Before confirm', 'uae', 'driver', 5); // started before the confirmation
    await confirm(a.token);
    await db.query("update public.job_alerts set last_checked_at = now() - interval '3 hours' where id = $1", [a.id]);
    const hit = await ad('Driver hit', 'uae', 'driver', 1);
    await ad('Wrong country', 'saudi', 'driver', 1);
    await ad('Wrong work', 'uae', 'cook', 1);
    await ad('Not live', 'uae', 'driver', 1, { status: 'paid_pending_review' });
    await ad('Ended', 'uae', 'driver', 1, { endsDays: -1 });
    await db.query('select public.queue_alert_digests()');
    const first = await digests(email);
    expect(first).toHaveLength(1);
    expect(first[0].data.total).toBe(1);
    expect(first[0].data.jobs.map((j) => j.id)).toEqual([hit]);
    await db.query('select public.queue_alert_digests()');
    expect(await digests(email)).toHaveLength(1); // nothing new: no second digest
  });

  it('an alert with no country and no work gets everything, listing at most 8 ads but counting all', async () => {
    await sub(null, 'all@x.co');
    const a = await alertOf('all@x.co');
    await confirm(a.token);
    await db.query("update public.job_alerts set last_checked_at = now() - interval '2 days' where id = $1", [a.id]);
    for (let i = 0; i < 10; i += 1) await ad(`Bulk ad ${i}`, 'qatar', 'helper', 2);
    await db.query('select public.queue_alert_digests()');
    const [d] = await digests('all@x.co');
    expect(d.data.total).toBeGreaterThanOrEqual(10);
    expect(d.data.jobs).toHaveLength(8);
  });

  it('the sender gets confirm mails only for unconfirmed alerts and digests only for confirmed ones, counts tries, and stops after 5', async () => {
    await db.query('delete from public.alert_outbox');
    await db.query('delete from public.job_alerts');
    await sub(null, 'new@x.co', 'oman');
    await sub(null, 'old@x.co', 'oman');
    const old = await alertOf('old@x.co', 'oman');
    await confirm(old.token); // its confirm mail is now moot
    await db.query("insert into public.alert_outbox (alert_id, kind, data) values ($1, 'digest', '{\"total\":1,\"jobs\":[]}')", [old.id]);
    const claimed = (await db.query('select * from public.claim_alert_mail(50)')).rows;
    expect(claimed.map((r) => `${r.email}:${r.kind}`).sort()).toEqual(['new@x.co:confirm', 'old@x.co:digest']);
    expect(claimed.every((r) => r.token && r.lang === 'en')).toBe(true);
    const confirmRow = claimed.find((r) => r.kind === 'confirm');
    await db.query('select public.mark_alert_mail_sent($1)', [claimed.find((r) => r.kind === 'digest').id]);
    for (let i = 0; i < 3; i += 1) expect((await db.query('select * from public.claim_alert_mail(50)')).rows).toHaveLength(1);
    await db.query('select public.mark_alert_mail_failed($1, $2)', [confirmRow.id, 'x'.repeat(400)]);
    expect((await rowsOf(db, 'select last_error from public.alert_outbox where id = $1', [confirmRow.id]))[0].last_error).toHaveLength(300);
    expect((await db.query('select * from public.claim_alert_mail(50)')).rows).toHaveLength(1); // 5th try
    expect((await db.query('select * from public.claim_alert_mail(50)')).rows).toHaveLength(0); // 5 tries are used
  });
});

describe('35. unsubscribing and clean-up', () => {
  it('the unsubscribe link removes every alert of that email and its messages, and only that email', async () => {
    await db.query('delete from public.job_alerts');
    await sub(null, 'bye@x.co', 'uae');
    await sub(null, 'bye@x.co', 'qatar');
    await sub(null, 'stay@x.co', 'uae');
    const a = await alertOf('bye@x.co', 'uae');
    expect(await as(db, null, () => db.query('select public.unsubscribe_job_alert($1) as ok', [a.token])).then((r) => r.rows[0].ok)).toBe(true);
    expect(await countOf(db, "select * from public.job_alerts where email = 'bye@x.co'")).toBe(0);
    expect(await countOf(db, "select * from public.job_alerts where email = 'stay@x.co'")).toBe(1);
    expect(await countOf(db, 'select * from public.alert_outbox o where not exists (select 1 from public.job_alerts a where a.id = o.alert_id)')).toBe(0);
    expect(await as(db, null, () => db.query('select public.unsubscribe_job_alert($1) as ok', [a.token])).then((r) => r.rows[0].ok)).toBe(false); // gone already
  });

  it('the daily clean-up removes alerts nobody confirmed in 7 days and old messages, and keeps the rest', async () => {
    await db.query('delete from public.job_alerts');
    await sub(null, 'stale@x.co', 'uae');
    await sub(null, 'fresh@x.co', 'uae');
    await sub(null, 'kept@x.co', 'uae');
    await confirm((await alertOf('kept@x.co', 'uae')).token);
    await db.query("update public.job_alerts set created_at = now() - interval '8 days' where email in ('stale@x.co', 'kept@x.co')");
    await db.query("update public.alert_outbox set created_at = now() - interval '40 days' where alert_id = (select id from public.job_alerts where email = 'fresh@x.co')");
    await db.query('select public.purge_job_alerts()');
    expect((await rowsOf(db, 'select email from public.job_alerts order by email')).map((r) => r.email)).toEqual(['fresh@x.co', 'kept@x.co']);
    expect(await countOf(db, "select * from public.alert_outbox where alert_id = (select id from public.job_alerts where email = 'fresh@x.co')")).toBe(0);
  });
});
