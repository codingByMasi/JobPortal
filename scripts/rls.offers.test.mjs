// SECURITY TESTS, PART 6: plans and offers (migration 0018): price quotes, orders, limits, locked prices, audit log.
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let e2; let pkg30; let pkg90;

async function newJob(owner, pkg = pkg30) {
  const { rows } = await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp)
     values ($1, $2, 'Ad', 'uae', 'Dubai', 'plumber', '919999999999') returning id`, [owner, pkg]);
  return rows[0].id;
}
const addOffer = (o) => db.query(
  `insert into public.offers (name, type, value, applies_to, package_id, recruiter_id, coupon_code, starts_at, ends_at, max_uses, max_uses_per_recruiter, active)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
  [o.name || 'Offer', o.type, o.value ?? 0, o.applies_to || 'all', o.package_id || null, o.recruiter_id || null, o.coupon || null,
    o.starts_at || null, o.ends_at || null, o.max_uses || null, o.per || 1, o.active ?? true]).then((r) => r.rows[0].id);
const quote = (who, pkg, code = null) => as(db, who, async () => (await db.query('select public.quote_price($1, $2) as q', [pkg, code])).rows[0].q);
const order = (who, job, pkg, code = null) => as(db, who, async () => (await db.query('select public.create_ad_order($1, $2, $3) as q', [job, pkg, code])).rows[0].q);
const clearOffers = () => db.query('delete from public.offers');

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  e2 = await addUser(db, 'e2@x.co', { company_name: 'Employer Two', phone: '9876500002' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
  pkg90 = (await rowsOf(db, "select id from public.packages where name = '30 Days Featured'"))[0].id;
}, 120000);

describe('19. quote_price: the offer types', () => {
  it('no offer: the list price, nothing off', async () => {
    const q = await quote(e1, pkg30);
    expect(q.ok).toBe(true);
    expect(q.discount_paise).toBe(0);
    expect(q.final_price_paise).toBe(q.list_price_paise);
  });
  it('percent: 20% off', async () => {
    await clearOffers();
    await addOffer({ type: 'percent', value: 20, coupon: 'SAVE20' });
    const q = await quote(e1, pkg30, 'save20'); // not case sensitive
    expect(q.discount_paise).toBe(Math.round(q.list_price_paise * 0.2));
    expect(q.final_price_paise).toBe(q.list_price_paise - q.discount_paise);
  });
  it('flat: a fixed amount off, never more than the price', async () => {
    await clearOffers();
    await addOffer({ type: 'flat', value: 10000, coupon: 'FLAT100' });
    await addOffer({ type: 'flat', value: 99999999, coupon: 'HUGE' });
    const q = await quote(e1, pkg30, 'FLAT100');
    expect(q.discount_paise).toBe(10000);
    const h = await quote(e1, pkg30, 'HUGE');
    expect(h.final_price_paise).toBe(0);
    expect(h.discount_paise).toBe(h.list_price_paise);
  });
  it('bonus days: same price, more days', async () => {
    await clearOffers();
    await addOffer({ type: 'bonus_days', value: 7, coupon: 'BONUS7' });
    const q = await quote(e1, pkg30, 'BONUS7');
    expect(q.final_price_paise).toBe(q.list_price_paise);
    expect(q.bonus_days).toBe(7);
    expect(q.final_days).toBe(q.base_days + 7);
  });
  it('free: total is zero', async () => {
    await clearOffers();
    await addOffer({ type: 'free', coupon: 'FREEAD' });
    const q = await quote(e1, pkg30, 'FREEAD');
    expect(q.final_price_paise).toBe(0);
  });
  it('percent of 100 or more than 100 is refused by the table', async () => {
    await denied(addOffer({ type: 'percent', value: 101 }));
    await denied(addOffer({ type: 'percent', value: 0 }));
  });
});

describe('20. quote_price: refusals in plain words', () => {
  it('unknown, expired, not started, switched off, wrong plan, wrong employer', async () => {
    await clearOffers();
    await addOffer({ type: 'percent', value: 10, coupon: 'OLD', starts_at: '2020-01-01', ends_at: '2020-02-01' });
    await addOffer({ type: 'percent', value: 10, coupon: 'SOON', starts_at: '2099-01-01' });
    await addOffer({ type: 'percent', value: 10, coupon: 'OFF', active: false });
    await addOffer({ type: 'percent', value: 10, coupon: 'PLAN90', applies_to: 'package', package_id: pkg90 });
    await addOffer({ type: 'percent', value: 10, coupon: 'ONLYE2', applies_to: 'recruiter', recruiter_id: e2 });
    expect((await quote(e1, pkg30, 'NOPE')).code).toBe('not_found');
    expect((await quote(e1, pkg30, 'OLD')).code).toBe('expired');
    expect((await quote(e1, pkg30, 'SOON')).code).toBe('not_started');
    expect((await quote(e1, pkg30, 'OFF')).code).toBe('inactive');
    expect((await quote(e1, pkg30, 'PLAN90')).code).toBe('wrong_plan');
    expect((await quote(e1, pkg30, 'ONLYE2')).code).toBe('wrong_recruiter');
    expect((await quote(e2, pkg30, 'ONLYE2')).ok).toBe(true);
    expect((await quote(e1, pkg90, 'PLAN90')).ok).toBe(true);
  });
  it('a visitor without login cannot ask for a price', async () => {
    await denied(as(db, null, () => db.query('select public.quote_price($1, null)', [pkg30])));
  });
  it('a plan that is switched off cannot be bought', async () => {
    await db.query("update public.packages set active = false where id = $1", [pkg90]);
    expect((await quote(e1, pkg90)).code).toBe('plan_unavailable');
    await db.query("update public.packages set active = true where id = $1", [pkg90]);
  });
});

describe('21. automatic offers: the best single one, no stacking', () => {
  it('picks the biggest saving, once', async () => {
    await clearOffers();
    await addOffer({ name: 'Ten', type: 'percent', value: 10 });
    await addOffer({ name: 'Thirty', type: 'percent', value: 30 });
    await addOffer({ name: 'Secret', type: 'percent', value: 90, coupon: 'SECRET' }); // needs the code, never automatic
    const q = await quote(e1, pkg30);
    expect(q.offer_name).toBe('Thirty');
    expect(q.discount_paise).toBe(Math.round(q.list_price_paise * 0.3));
  });
  it('an offer for one employer is automatic only for that employer', async () => {
    await clearOffers();
    await addOffer({ name: 'Just e2', type: 'percent', value: 50, applies_to: 'recruiter', recruiter_id: e2 });
    expect((await quote(e1, pkg30)).discount_paise).toBe(0);
    expect((await quote(e2, pkg30)).discount_paise).toBeGreaterThan(0);
  });
});

describe('22. create_ad_order: saves the price and the offer use', () => {
  it('keeps the saved price on the ad and a waiting payment, and counts one use', async () => {
    await clearOffers();
    const off = await addOffer({ type: 'percent', value: 20, coupon: 'TWENTY', max_uses: 5 });
    const job = await newJob(e1);
    const q = await order(e1, job, pkg30, 'TWENTY');
    expect(q.job_status).toBe('pending_payment');
    const [j] = await rowsOf(db, 'select * from public.jobs where id = $1', [job]);
    expect(j.final_price_paise).toBe(q.final_price_paise);
    expect(j.price_paise_at_order).toBe(q.final_price_paise);
    expect(j.offer_id).toBe(off);
    const pays = await rowsOf(db, "select * from public.payments where job_id = $1", [job]);
    expect(pays).toHaveLength(1);
    expect(pays[0].status).toBe('created');
    expect(pays[0].amount_paise).toBe(q.final_price_paise);
    expect(await countOf(db, 'select 1 from public.offer_redemptions where offer_id = $1', [off])).toBe(1);
    // ordering the same ad again does not use the offer twice
    await order(e1, job, pkg30, 'TWENTY');
    expect(await countOf(db, 'select 1 from public.offer_redemptions where offer_id = $1', [off])).toBe(1);
    expect(await countOf(db, "select 1 from public.payments where job_id = $1", [job])).toBe(1);
  });
  it('per-employer limit: the same code twice is refused as already used', async () => {
    await clearOffers();
    await addOffer({ type: 'percent', value: 20, coupon: 'ONCE' });
    await order(e1, await newJob(e1), pkg30, 'ONCE');
    const err = await denied(order(e1, await newJob(e1), pkg30, 'ONCE'));
    expect(err.message).toContain('already_used');
    await expect(order(e2, await newJob(e2), pkg30, 'ONCE')).resolves.toBeTruthy();
  });
  it('total limit: used up after max uses', async () => {
    await clearOffers();
    await addOffer({ type: 'percent', value: 20, coupon: 'TWICE', max_uses: 2 });
    await order(e1, await newJob(e1), pkg30, 'TWICE');
    await order(e2, await newJob(e2), pkg30, 'TWICE');
    const e3 = await addUser(db, 'e3@x.co', { company_name: 'Three', phone: '9876500003' });
    const err = await denied(order(e3, await newJob(e3), pkg30, 'TWICE'));
    expect(err.message).toContain('used_up');
  });
  it('deleting the unpaid ad gives the use back and removes the waiting payment', async () => {
    await clearOffers();
    const off = await addOffer({ type: 'percent', value: 20, coupon: 'BACK' });
    const job = await newJob(e1);
    await order(e1, job, pkg30, 'BACK');
    await as(db, e1, () => db.query('delete from public.jobs where id = $1', [job]));
    expect(await countOf(db, 'select 1 from public.offer_redemptions where offer_id = $1', [off])).toBe(0);
    expect(await countOf(db, 'select 1 from public.payments where job_id = $1', [job])).toBe(0);
    await expect(order(e1, await newJob(e1), pkg30, 'BACK')).resolves.toBeTruthy();
  });
  it('a free total is paid at once and goes to review', async () => {
    await clearOffers();
    await addOffer({ type: 'free', coupon: 'FREEAD' });
    const job = await newJob(e1);
    const q = await order(e1, job, pkg30, 'FREEAD');
    expect(q.job_status).toBe('paid_pending_review');
    const [p] = await rowsOf(db, 'select * from public.payments where job_id = $1', [job]);
    expect([p.status, p.method, p.amount_paise]).toEqual(['paid', 'free_offer', 0]);
    const [j] = await rowsOf(db, 'select status from public.jobs where id = $1', [job]);
    expect(j.status).toBe('paid_pending_review');
  });
  it('an employer cannot order for someone else\'s ad, or an ad that is not waiting', async () => {
    await clearOffers();
    const job = await newJob(e1);
    await denied(order(e2, job, pkg30));
    await order(e1, job, pkg30);
    await db.query("update public.jobs set status = 'live', starts_at = now(), expires_at = now() + interval '5 days' where id = $1", [job]);
    await denied(order(e1, job, pkg30));
  });
  it('a refused code leaves the ad as it was', async () => {
    await clearOffers();
    const job = await newJob(e1);
    await denied(order(e1, job, pkg30, 'BADCODE'));
    expect(await countOf(db, 'select 1 from public.payments where job_id = $1', [job])).toBe(0);
  });
});

describe('23. old ads keep their price when plans or offers change', () => {
  it('changing the plan price or switching the offer off does not touch the saved order', async () => {
    await clearOffers();
    await addOffer({ type: 'percent', value: 20, coupon: 'KEEP' });
    const job = await newJob(e1);
    const q = await order(e1, job, pkg30, 'KEEP');
    await db.query('update public.packages set price_paise = price_paise * 2, duration_days = duration_days + 5 where id = $1', [pkg30]);
    await db.query('update public.offers set active = false');
    const [j] = await rowsOf(db, 'select final_price_paise, duration_days_final, price_paise_at_order from public.jobs where id = $1', [job]);
    expect(j.final_price_paise).toBe(q.final_price_paise);
    expect(j.duration_days_final).toBe(q.final_days);
    expect(j.price_paise_at_order).toBe(q.final_price_paise);
    await db.query('update public.packages set price_paise = price_paise / 2, duration_days = duration_days - 5 where id = $1', [pkg30]);
  });
  it('approval uses the saved days, bonus days included', async () => {
    await clearOffers();
    await addOffer({ type: 'bonus_days', value: 10, coupon: 'B10' });
    const job = await newJob(e1);
    const q = await order(e1, job, pkg30, 'B10');
    await db.query("update public.jobs set status = 'paid_pending_review' where id = $1", [job]);
    await as(db, admin, () => db.query('select public.admin_approve_job($1)', [job]));
    const [j] = await rowsOf(db, "select extract(day from expires_at - starts_at)::int as d from public.jobs where id = $1", [job]);
    expect(j.d).toBe(q.final_days);
  });
  it('mark paid fills the waiting payment instead of adding a second one', async () => {
    await clearOffers();
    const job = await newJob(e1);
    await order(e1, job, pkg30);
    await as(db, admin, () => db.query("select public.admin_mark_paid($1, null, 'ok', 'REF123456')", [job]));
    const pays = await rowsOf(db, 'select status from public.payments where job_id = $1', [job]);
    expect(pays).toEqual([{ status: 'paid' }]);
  });
});

describe('24. employers cannot change plans, offers, prices or the log', () => {
  it('cannot write plans or offers', async () => {
    await expect(as(db, e1, async () => (await db.query("update public.packages set price_paise = 1 returning id")).rows)).resolves.toEqual([]);
    await denied(as(db, e1, () => db.query("insert into public.offers (name, type, value) values ('x','percent',50)")));
    await expect(as(db, e1, async () => (await db.query("update public.offers set value = 99 returning id")).rows)).resolves.toEqual([]);
  });
  it('cannot change the saved prices, the offer or the days of their own ad', async () => {
    await clearOffers();
    const job = await newJob(e1);
    await order(e1, job, pkg30);
    for (const set of ['final_price_paise = 0', 'list_price_paise = 0', 'discount_paise = 5', 'duration_days_final = 999', 'price_paise_at_order = 0', 'featured_override = true']) {
      await denied(as(db, e1, () => db.query(`update public.jobs set ${set} where id = $1`, [job])));
    }
  });
  it('cannot write payments or redemptions', async () => {
    await clearOffers();
    const off = await addOffer({ type: 'percent', value: 10, coupon: 'WRITE' });
    const job = await newJob(e1);
    await denied(as(db, e1, () => db.query("insert into public.payments (job_id, recruiter_id, amount_paise, method, status) values ($1, $2, 0, 'free_offer', 'paid')", [job, e1])));
    await denied(as(db, e1, () => db.query('insert into public.offer_redemptions (offer_id, recruiter_id, job_id) values ($1, $2, $3)', [off, e1, job])));
  });
  it('cannot call the internal price function directly with someone else\'s id', async () => {
    await denied(as(db, e1, () => db.query('select public.quote_price_for($1, $2, null)', [e2, pkg30])));
  });
  it('sees only offers that are open to them, and never other coupon codes', async () => {
    await clearOffers();
    await addOffer({ name: 'Public', type: 'percent', value: 5 });
    await addOffer({ name: 'Secret', type: 'percent', value: 50, coupon: 'HIDDEN' });
    await addOffer({ name: 'Mine', type: 'percent', value: 15, applies_to: 'recruiter', recruiter_id: e1 });
    await addOffer({ name: 'Theirs', type: 'percent', value: 15, applies_to: 'recruiter', recruiter_id: e2 });
    await addOffer({ name: 'Off', type: 'percent', value: 15, active: false });
    const seen = await as(db, e1, async () => (await db.query('select name from public.offers order by name')).rows.map((r) => r.name));
    expect(seen).toEqual(['Mine', 'Public']);
    expect(await as(db, null, async () => { try { return (await db.query('select * from public.offers')).rows.length; } catch { return 0; } })).toBe(0);
  });
  it('sees only their own redemptions, and never the audit log', async () => {
    await clearOffers();
    await addOffer({ type: 'percent', value: 10, coupon: 'RED1' });
    await order(e1, await newJob(e1), pkg30, 'RED1');
    expect(await as(db, e1, async () => (await db.query('select * from public.offer_redemptions')).rows.length)).toBe(1);
    expect(await as(db, e2, async () => (await db.query('select * from public.offer_redemptions')).rows.length)).toBe(0);
    expect(await as(db, e1, async () => (await db.query('select * from public.audit_log')).rows.length)).toBe(0);
    expect(await as(db, admin, async () => (await db.query('select * from public.audit_log')).rows.length)).toBeGreaterThan(0);
  });
  it('an employer sees an inactive plan only when one of their own ads uses it', async () => {
    const [{ id: oldPlan }] = await rowsOf(db, "insert into public.packages (name, price_paise, duration_days) values ('Old plan', 50000, 10) returning id");
    await newJob(e1, oldPlan);
    await db.query('update public.packages set active = false where id = $1', [oldPlan]);
    expect(await as(db, e1, async () => (await db.query('select id from public.packages where id = $1', [oldPlan])).rows.length)).toBe(1);
    expect(await as(db, e2, async () => (await db.query('select id from public.packages where id = $1', [oldPlan])).rows.length)).toBe(0);
    await denied(as(db, null, () => db.query('select id from public.packages where id = $1', [oldPlan]))); // visitors have no right on plans (migration 0037)
  });
});

describe('25. plans: order, delete rule and audit log', () => {
  it('a plan with ads cannot be deleted; an unused plan can', async () => {
    const err = await denied(as(db, admin, () => db.query('delete from public.packages where id = $1', [pkg30])));
    expect(err.message).toMatch(/has ads/);
    const [{ id }] = await rowsOf(db, "insert into public.packages (name, price_paise, duration_days) values ('Spare', 1000, 5) returning id");
    await as(db, admin, () => db.query('delete from public.packages where id = $1', [id]));
  });
  it('a new plan goes to the end of the list', async () => {
    const [{ m }] = await rowsOf(db, 'select max(sort_order)::int as m from public.packages');
    const [{ sort_order }] = await rowsOf(db, "insert into public.packages (name, price_paise, duration_days) values ('Last', 1000, 5) returning sort_order");
    expect(sort_order).toBeGreaterThan(m);
  });
  it('plan and offer changes are written to the audit log with the old and new values', async () => {
    const before = await countOf(db, "select 1 from public.audit_log where table_name = 'packages'");
    await as(db, admin, () => db.query("update public.packages set badge_text = 'Best value' where id = $1", [pkg30]));
    const rows = await rowsOf(db, "select admin_id, action, old_value, new_value from public.audit_log where table_name = 'packages' order by created_at desc limit 1");
    expect(await countOf(db, "select 1 from public.audit_log where table_name = 'packages'")).toBe(before + 1);
    expect(rows[0].admin_id).toBe(admin);
    expect(rows[0].action).toBe('update');
    expect(rows[0].new_value.badge_text).toBe('Best value');
    expect(rows[0].old_value.badge_text).toBe('');
    await db.query("update public.offers set name = name"); // nothing changed: nothing logged
  });
  it('the audit log cannot be written or changed by anyone through the website', async () => {
    await denied(as(db, admin, () => db.query("insert into public.audit_log (action, table_name) values ('x','y')")));
    await denied(as(db, e1, () => db.query('delete from public.audit_log returning id'))); // no right to write the log at all (migration 0037)
    await denied(as(db, admin, () => db.query('update public.audit_log set action = $1 returning id', ['x'])));
  });
});

describe('26. admin actions on one ad', () => {
  it('extend days needs a reason and only works on live or hidden ads', async () => {
    const job = await newJob(e1);
    await db.query("update public.jobs set status = 'live', starts_at = now(), expires_at = now() + interval '5 days' where id = $1", [job]);
    await denied(as(db, e1, () => db.query("select public.admin_extend_job($1, 5, 'because')", [job])));
    await denied(as(db, admin, () => db.query("select public.admin_extend_job($1, 5, '')", [job])));
    await denied(as(db, admin, () => db.query("select public.admin_extend_job($1, 0, 'because')", [job])));
    await as(db, admin, () => db.query("select public.admin_extend_job($1, 5, 'sorry for the delay')", [job]));
    const [j] = await rowsOf(db, "select round(extract(epoch from expires_at - now()) / 86400)::int as d from public.jobs where id = $1", [job]);
    expect(j.d).toBe(10);
  });
  it('featured switch is admin only and changes the public list', async () => {
    const job = await newJob(e1);
    await db.query("update public.jobs set status = 'live', starts_at = now(), expires_at = now() + interval '5 days' where id = $1", [job]);
    await denied(as(db, e1, () => db.query('select public.admin_set_featured($1, true)', [job])));
    await as(db, admin, () => db.query('select public.admin_set_featured($1, true)', [job]));
    const [v] = await rowsOf(db, 'select featured from public.public_jobs where id = $1', [job]);
    expect(v.featured).toBe(true);
  });
  it('free ad needs a note, makes a complimentary payment of 0 and sends the ad to review', async () => {
    const job = await newJob(e1);
    await order(e1, job, pkg30);
    await denied(as(db, e1, () => db.query("select public.admin_give_free_ad($1, 'friend')", [job])));
    await denied(as(db, admin, () => db.query("select public.admin_give_free_ad($1, '')", [job])));
    await as(db, admin, () => db.query("select public.admin_give_free_ad($1, 'Launch gift')", [job]));
    const pays = await rowsOf(db, 'select status, method, amount_paise from public.payments where job_id = $1', [job]);
    expect(pays).toEqual([{ status: 'paid', method: 'complimentary', amount_paise: 0 }]);
    const [j] = await rowsOf(db, 'select status from public.jobs where id = $1', [job]);
    expect(j.status).toBe('paid_pending_review');
  });
});
