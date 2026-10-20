// SECURITY TESTS, PART 17: files of deleted or replaced ads go into a queue that only an admin can read and empty (migration 0032).
import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, countOf, denied, makeDb, rowsOf } from './rls/harness.mjs';

let db;
let admin; let e1; let pkg30;

const putFile = (owner, name) => db.query("insert into storage.objects (bucket_id, name, owner) values ('job-files', $1, $2)", [name, owner]);
const adWithFiles = async (owner, title, file, thumb) => {
  await putFile(owner, file);
  if (thumb) await putFile(owner, thumb);
  return (await db.query(
    `insert into public.jobs (recruiter_id, package_id, title, country, city, category, whatsapp, status, file_path, thumb_path)
     values ($1, $2, $3, 'uae', 'Dubai', 'plumber', '919999999999', 'rejected', $4, $5) returning id`, [owner, pkg30, title, file, thumb || null])).rows[0].id;
};
const queued = async () => (await rowsOf(db, 'select path from public.file_cleanup_queue order by path')).map((r) => r.path);

beforeAll(async () => {
  db = await makeDb();
  await db.query("insert into public.app_settings (key, value) values ('storage_base', 'https://abc.supabase.co')");
  admin = await addUser(db, 'admin@x.co');
  e1 = await addUser(db, 'e1@x.co', { company_name: 'Employer One', phone: '9876500001' });
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin]);
  pkg30 = (await rowsOf(db, "select id from public.packages where name = '30 Days'"))[0].id;
}, 120000);

describe('31. file clean-up queue (migration 0032)', () => {
  it('deleting an ad queues its picture and its small picture, even when the employer\'s browser never removes them (GAP-1)', async () => {
    const id = await adWithFiles(e1, 'To delete', `${e1}/a.jpg`, `${e1}/a-t.jpg`);
    expect(await queued()).toEqual([]);
    expect((await as(db, e1, () => db.query('delete from public.jobs where id = $1', [id]))).affectedRows).toBe(1);
    expect(await queued()).toEqual([`${e1}/a-t.jpg`, `${e1}/a.jpg`]);
  });

  it('an ad without files queues nothing, and a deleted ad of someone else changes nothing', async () => {
    const before = await queued();
    const id = (await db.query("insert into public.jobs (recruiter_id, package_id, title, status, whatsapp) values ($1, $2, 'No file', 'rejected', '919999999999') returning id", [e1, pkg30])).rows[0].id;
    await db.query('delete from public.jobs where id = $1', [id]);
    expect(await queued()).toEqual(before);
  });

  it('replacing the picture of an ad queues the OLD one; keeping it queues nothing', async () => {
    const id = await adWithFiles(e1, 'To replace', `${e1}/old.jpg`, null);
    await putFile(e1, `${e1}/new.jpg`);
    await as(db, e1, () => db.query("update public.jobs set title = 'Same picture' where id = $1", [id]));
    expect(await queued()).not.toContain(`${e1}/old.jpg`);
    await as(db, e1, () => db.query('update public.jobs set file_path = $2 where id = $1', [id, `${e1}/new.jpg`]));
    expect(await queued()).toContain(`${e1}/old.jpg`);
    expect(await queued()).not.toContain(`${e1}/new.jpg`);
  });

  it('only an admin can read the queue or empty it; nobody writes to it directly', async () => {
    expect(await as(db, e1, () => countOf(db, 'select * from public.file_cleanup_queue'))).toBe(0);
    expect(await as(db, null, () => countOf(db, 'select * from public.file_cleanup_queue')).catch(() => 0)).toBe(0);
    expect(await as(db, admin, () => countOf(db, 'select * from public.file_cleanup_queue'))).toBeGreaterThan(0);
    await denied(as(db, e1, () => db.query("insert into public.file_cleanup_queue (path) values ('x/y.jpg')")));
    await denied(as(db, admin, () => db.query("insert into public.file_cleanup_queue (path) values ('x/y.jpg')")));
    const all = await queued();
    expect((await as(db, e1, () => db.query('delete from public.file_cleanup_queue'))).affectedRows).toBe(0);
    expect((await queued()).length).toBe(all.length);
    await as(db, admin, () => db.query('delete from public.file_cleanup_queue'));
    expect(await queued()).toEqual([]);
  });
});
