// SECURITY TESTS, PART 9: site settings the admin can change (migration 0021).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db; let admin; let e1;
const save = (who, values) => as(db, who, () => db.query('select public.admin_save_settings($1::jsonb)', [JSON.stringify(values)]));
const read = (who) => as(db, who, async () => (await db.query('select key, value from public.site_settings order by key')).rows);

beforeAll(async () => {
  db = await makeDb();
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
}, 120000);

describe('26. site settings', () => {
  it('the admin saves them; a 10-digit WhatsApp number gets 91; every change is logged with old and new value', async () => {
    await save(admin, { whatsapp_number: '98765 43210', upi_id: 'jobsabroad@okbank', upi_name: 'Jobs Abroad Services', contact_email: 'help@jobsabroad.in', company_name: 'Jobs Abroad Pvt Ltd', site_url: 'https://jobsabroad.in' });
    const rows = Object.fromEntries((await read(admin)).map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({ whatsapp_number: '919876543210', upi_id: 'jobsabroad@okbank', site_url: 'https://jobsabroad.in' });
    const [log] = await rowsOf(db, "select detail from public.admin_log where action = 'save_settings' order by created_at desc limit 1");
    expect(log.detail).toContain('upi_id: (empty) -> jobsabroad@okbank');
    await save(admin, { upi_id: 'new@okbank' });
    const [log2] = await rowsOf(db, "select detail from public.admin_log where action = 'save_settings' order by created_at desc limit 1");
    expect(log2.detail).toContain('upi_id: jobsabroad@okbank -> new@okbank');
  });
  it('saving the same values again writes no new log line', async () => {
    const before = (await rowsOf(db, "select count(*)::int as n from public.admin_log where action = 'save_settings'"))[0].n;
    await save(admin, { upi_id: 'new@okbank' });
    expect((await rowsOf(db, "select count(*)::int as n from public.admin_log where action = 'save_settings'"))[0].n).toBe(before);
  });
  it('refuses wrong values: phone, UPI, email, site address with a path or http, unknown key, too short name', async () => {
    for (const bad of [{ whatsapp_number: '12345' }, { upi_id: 'no-at-sign' }, { upi_id: 'a b@bank' }, { contact_email: 'nope' }, { site_url: 'http://x.com' }, { site_url: 'https://x.com/path' }, { site_url: 'https://x.com/' }, { company_name: 'A' }, { password: 'x' }]) {
      await denied(save(admin, bad));
    }
  });
  it('an empty text clears a setting', async () => {
    await save(admin, { grievance_name: 'Asha Verma' });
    await save(admin, { grievance_name: '' });
    expect((await read(admin)).find((r) => r.key === 'grievance_name').value).toBe('');
  });
  it('employers and visitors cannot save; nobody can write the table directly', async () => {
    await denied(save(e1, { upi_id: 'thief@bank' }));
    await denied(save(null, { upi_id: 'thief@bank' }));
    await denied(as(db, e1, () => db.query("insert into public.site_settings (key, value) values ('upi_id', 'thief@bank')")));
    await denied(as(db, admin, () => db.query("update public.site_settings set value = 'x@bank' where key = 'upi_id'")));
    expect((await read(admin)).find((r) => r.key === 'upi_id').value).toBe('new@okbank');
  });
  it('a visitor reads only the public ones; a logged-in employer also reads the UPI details', async () => {
    const visitor = (await read(null)).map((r) => r.key);
    expect(visitor).toEqual(expect.arrayContaining(['whatsapp_number', 'contact_email', 'company_name', 'site_url']));
    expect(visitor).not.toContain('upi_id');
    expect(visitor).not.toContain('upi_name');
    const employer = (await read(e1)).map((r) => r.key);
    expect(employer).toEqual(expect.arrayContaining(['upi_id', 'upi_name', 'whatsapp_number']));
  });
});
