// SECURITY TESTS, PART 19: the notification queue (migration 0034): who gets what, when, and who can touch the queue.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30;

const waiting = async (owner, title) => (await db.query(
  `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status)
   values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999', 'paid_pending_review') returning id`, [owner, pkg30, title])).rows[0].id;
const adminDo = (sql, params) => as(db, admin, () => db.query(sql, params));
const queued = (kind, who) => rowsOf(db, 'select * from public.notifications where kind = $1 and recipient_id = $2 order by created_at', [kind, who]);
const clear = () => db.query('delete from public.notifications');

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('33. a message is queued for each event (migration 0034)', () => {
  it('approving an ad queues one "approved" message with the title, the days and the end date', async () => {
    const id = await waiting(e1, 'Welders needed');
    await adminDo('select public.admin_approve_job($1, 20)', [id]);
    const [n] = await queued('ad_approved', e1);
    expect(n).toMatchObject({ sent_at: null, attempts: 0 });
    expect(n.data).toMatchObject({ job_id: id, title: 'Welders needed', days: 20 });
    expect(new Date(n.data.ends) - Date.now()).toBeGreaterThan(19 * 86400000);
    expect(await queued('ad_approved', e2)).toEqual([]);
  });

  it('rejecting an ad queues "rejected" with the reason', async () => {
    const id = await waiting(e1, 'Fix me');
    await adminDo("select public.admin_reject_job($1, 'Phone number is missing')", [id]);
    const [n] = await queued('ad_rejected', e1);
    expect(n.data).toMatchObject({ job_id: id, title: 'Fix me', reason: 'Phone number is missing' });
  });

  it('adding days queues "extended"; a refused action (no reason, not an admin) queues nothing', async () => {
    const id = await waiting(e1, 'Extend me');
    await adminDo('select public.admin_approve_job($1, 5)', [id]);
    await denied(adminDo("select public.admin_extend_job($1, 3, 'x')", [id]));
    await denied(as(db, e1, () => db.query("select public.admin_extend_job($1, 3, 'trying it')", [id])));
    const before = (await queued('ad_extended', e1)).length;
    await adminDo("select public.admin_extend_job($1, 10, 'Employer asked')", [id]);
    const all = await queued('ad_extended', e1);
    expect(all.length).toBe(before + 1);
    expect(all.at(-1).data).toMatchObject({ title: 'Extend me', days: 10 });
  });

  it('verifying an employer queues "verified"; rejecting a license queues "license rejected" with the reason', async () => {
    await db.query("insert into public.verification_requests (recruiter_id, license_number, file_path) values ($1, 'LIC-N-1', $2)", [e2, `${e2}/license.jpg`]);
    const [req] = await rowsOf(db, 'select id from public.verification_requests where recruiter_id = $1', [e2]);
    await adminDo("select public.admin_reject_verification($1, 'The license has expired.')", [req.id]);
    expect((await queued('license_rejected', e2))[0].data).toMatchObject({ reason: 'The license has expired.' });
    await db.query("update public.verification_requests set status = 'submitted' where id = $1", [req.id]);
    await adminDo('update public.profiles set verified = true where id = $1', [e2]);
    expect((await queued('license_verified', e2)).length).toBe(1);
  });

  it('an ad whose days end queues "ended" once, however often the job runs', async () => {
    await clear();
    const id = await waiting(e1, 'Will end');
    await adminDo('select public.admin_approve_job($1, 2)', [id]);
    await clear();
    await db.query("update public.jobs set expires_at = now() - interval '1 hour' where id = $1", [id]);
    expect(Number((await db.query('select public.expire_jobs() as n')).rows[0].n)).toBe(1);
    expect(Number((await db.query('select public.expire_jobs() as n')).rows[0].n)).toBe(0);
    const all = await queued('ad_ended', e1);
    expect(all.length).toBe(1);
    expect(all[0].data).toMatchObject({ job_id: id, title: 'Will end' });
  });

  it('an ad ending within 3 days queues one "ends soon" message; adding days allows a new one later', async () => {
    await clear();
    const id = await waiting(e1, 'Ends soon');
    await adminDo('select public.admin_approve_job($1, 2)', [id]);
    await clear();
    expect(Number((await db.query('select public.queue_ending_reminders() as n')).rows[0].n)).toBe(1);
    expect(Number((await db.query('select public.queue_ending_reminders() as n')).rows[0].n)).toBe(0); // only once
    expect((await queued('ad_ending_soon', e1)).length).toBe(1);
    await adminDo("select public.admin_extend_job($1, 1, 'A little more')", [id]);
    expect(Number((await db.query('select public.queue_ending_reminders() as n')).rows[0].n)).toBe(1); // the new end is soon too
    const later = await waiting(e1, 'Ends in 20 days');
    await adminDo('select public.admin_approve_job($1, 20)', [later]);
    expect(Number((await db.query('select public.queue_ending_reminders() as n')).rows[0].n)).toBe(0); // far away: no message
  });

  it('a blocked employer gets nothing queued', async () => {
    await clear();
    await db.query('update public.profiles set blocked = true where id = $1', [e2]);
    const id = await waiting(e2, 'Blocked ad');
    await db.query("update public.profiles set blocked = false where id = $1", [e2]);
    await db.query('update public.profiles set blocked = true where id = $1', [e2]);
    await adminDo("select public.admin_reject_job($1, 'Not allowed')", [id]);
    expect(await countOf(db, 'select * from public.notifications')).toBe(0);
    await db.query('update public.profiles set blocked = false where id = $1', [e2]);
  });
});

describe('34. the sender\'s functions (migration 0034)', () => {
  it('claim_notifications hands out due messages with the email, counts the try, and respects the employer\'s choice', async () => {
    await clear();
    const a = await waiting(e1, 'Claim one');
    await adminDo("select public.admin_reject_job($1, 'Reason A')", [a]);
    const b = await waiting(e2, 'Claim two');
    await adminDo("select public.admin_reject_job($1, 'Reason B')", [b]);
    await db.query('update public.profiles set email_notifications = false where id = $1', [e2]); // e2 turned emails off
    const claimed = (await db.query('select * from public.claim_notifications(50)')).rows;
    expect(claimed.length).toBe(1);
    expect(claimed[0]).toMatchObject({ kind: 'ad_rejected', email: 'e1@x.co' });
    expect(claimed[0].data.reason).toBe('Reason A');
    expect((await rowsOf(db, "select attempts from public.notifications where kind = 'ad_rejected' and recipient_id = $1", [e1]))[0].attempts).toBe(1);
    await db.query('update public.profiles set email_notifications = true where id = $1', [e2]);
  });

  it('a sent message is not handed out again; a failed one is, up to 5 tries', async () => {
    await clear();
    const id = await waiting(e1, 'Retry me');
    await adminDo("select public.admin_reject_job($1, 'Try again')", [id]);
    const [{ id: nid }] = (await db.query('select * from public.claim_notifications(10)')).rows;
    await db.query('select public.mark_notification_failed($1, $2)', [nid, 'Resend said 500']);
    expect((await rowsOf(db, 'select last_error from public.notifications where id = $1', [nid]))[0].last_error).toBe('Resend said 500');
    for (let i = 0; i < 4; i += 1) expect((await db.query('select * from public.claim_notifications(10)')).rows.length).toBe(1);
    expect((await db.query('select * from public.claim_notifications(10)')).rows.length).toBe(0); // 5 tries are used
    await db.query('update public.notifications set attempts = 0 where id = $1', [nid]);
    await db.query('select public.mark_notification_sent($1)', [nid]);
    expect((await db.query('select * from public.claim_notifications(10)')).rows.length).toBe(0);
    expect((await rowsOf(db, 'select sent_at, last_error from public.notifications where id = $1', [nid]))[0].last_error).toBeNull();
  });

  it('only the server can call the queue functions; employers, admins and visitors cannot; only an admin reads the table', async () => {
    for (const who of [e1, admin, null]) {
      await denied(as(db, who, () => db.query('select * from public.claim_notifications(10)')));
      await denied(as(db, who, () => db.query("select public.mark_notification_sent('00000000-0000-0000-0000-000000000000')")));
      await denied(as(db, who, () => db.query("select public.queue_notification($1, 'ad_ended', '{}')", [e1])));
      await denied(as(db, who, () => db.query('select public.queue_ending_reminders()')));
      await denied(as(db, who, () => db.query('select public.purge_old_notifications()')));
    }
    await denied(as(db, e1, () => db.query("insert into public.notifications (recipient_id, kind) values ($1, 'ad_ended')", [e1])));
    expect(await as(db, e1, () => countOf(db, 'select * from public.notifications'))).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.notifications'))).toBeGreaterThan(0);
  });

  it('old messages are purged after 60 days', async () => {
    await clear();
    await db.query("insert into public.notifications (recipient_id, kind, created_at) values ($1, 'ad_ended', now() - interval '61 days'), ($1, 'ad_ended', now() - interval '5 days')", [e1]);
    expect(Number((await db.query('select public.purge_old_notifications() as n')).rows[0].n)).toBe(1);
    expect(await countOf(db, 'select * from public.notifications')).toBe(1);
  });

  it('an employer can turn the emails off for themselves, and cannot change anyone else\'s choice', async () => {
    expect((await as(db, e1, () => db.query('update public.profiles set email_notifications = false where id = $1', [e1]))).affectedRows).toBe(1);
    expect((await as(db, e1, () => db.query('update public.profiles set email_notifications = false where id = $1', [e2]))).affectedRows).toBe(0);
    expect((await rowsOf(db, 'select email_notifications from public.profiles where id = $1', [e2]))[0].email_notifications).toBe(true);
    await db.query('update public.profiles set email_notifications = true where id = $1', [e1]);
  });
});
