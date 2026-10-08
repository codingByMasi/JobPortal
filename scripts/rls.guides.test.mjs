// SECURITY TESTS, PART 10: the guides are readable by admins only (migration 0022).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, denied, makeDb } from './rls/harness.mjs';

let db; let admin; let e1;
const count = (who) => as(db, who, async () => { try { return (await db.query('select * from public.guides')).rows.length; } catch { return 0; } });

beforeAll(async () => {
  db = await makeDb();
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  await db.query("insert into public.guides (slug, title, body, sort_order) values ('admin-guide', 'Admin guide', 'secret steps', 1), ('employer-guide', 'Employer guide', 'steps', 2)");
}, 120000);

describe('27. guides are admin only', () => {
  it('the admin reads them', async () => {
    expect(await count(admin)).toBe(2);
  });
  it('visitors and employers see nothing', async () => {
    expect(await count(null)).toBe(0);
    expect(await count(e1)).toBe(0);
  });
  it('nobody can write them through the website, not even the admin', async () => {
    await denied(as(db, admin, () => db.query("insert into public.guides (slug, title, body) values ('app-features', 'x', 'y')")));
    await denied(as(db, e1, () => db.query("insert into public.guides (slug, title, body) values ('app-features', 'x', 'y')")));
    await denied(as(db, admin, () => db.query("update public.guides set body = 'changed'")));
    await denied(as(db, admin, () => db.query('delete from public.guides')));
    expect(await count(admin)).toBe(2);
  });
  it('only the four known guide names are accepted', async () => {
    await denied(db.query("insert into public.guides (slug, title, body) values ('other', 'x', 'y')"));
  });
});
