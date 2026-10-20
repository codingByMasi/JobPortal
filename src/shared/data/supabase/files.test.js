// The real (Supabase) clean-up of queued files, against a recording stand-in for the Supabase client (migration 0032).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { queue: [], usedByFile: [], usedByThumb: [], calls: [], removed: [] };
  const chain = (table, op) => {
    const call = { table, op, ops: [] };
    state.calls.push(call);
    const result = () => {
      if (table === 'file_cleanup_queue' && op === 'select') return { data: state.queue.map((path) => ({ path })), error: null };
      if (table === 'jobs') return { data: call.column === 'file_path' ? state.usedByFile.map((p) => ({ file_path: p })) : state.usedByThumb.map((p) => ({ thumb_path: p })), error: null };
      return { data: null, error: null };
    };
    const proxy = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
        return (...args) => {
          call.ops.push([prop, ...args]);
          if (prop === 'select' && table === 'jobs') call.column = args[0];
          return proxy;
        };
      },
    });
    return proxy;
  };
  const client = {
    from: (table) => ({
      select: (...a) => { const c = chain(table, 'select'); return c.select(...a); },
      delete: (...a) => { const c = chain(table, 'delete'); return c.delete(...a); },
    }),
    storage: { from: (bucket) => ({ remove: async (paths) => { state.removed.push({ bucket, paths }); return { data: paths.map((name) => ({ name })), error: null }; } }) },
  };
  return { state, client };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

let files;
beforeEach(async () => {
  Object.assign(fake.state, { queue: [], usedByFile: [], usedByThumb: [], calls: [], removed: [] });
  files = await import('./files');
});

describe('adminCleanQueuedFiles', () => {
  it('does nothing and calls no storage when the queue is empty', async () => {
    expect(await files.adminCleanQueuedFiles()).toBe(0);
    expect(fake.state.removed).toEqual([]);
  });

  it('removes the queued files from the job-files bucket and empties the queue rows', async () => {
    fake.state.queue = ['u1/a.jpg', 'u1/a-t.jpg'];
    expect(await files.adminCleanQueuedFiles()).toBe(2);
    expect(fake.state.removed).toEqual([{ bucket: 'job-files', paths: ['u1/a.jpg', 'u1/a-t.jpg'] }]);
    const del = fake.state.calls.find((c) => c.table === 'file_cleanup_queue' && c.op === 'delete');
    expect(del.ops).toContainEqual(['in', 'path', ['u1/a.jpg', 'u1/a-t.jpg']]);
  });

  it('never removes a file that an ad uses again, but still drops it from the queue', async () => {
    fake.state.queue = ['u1/keep.jpg', 'u1/gone.jpg', 'u1/keep-t.jpg'];
    fake.state.usedByFile = ['u1/keep.jpg'];
    fake.state.usedByThumb = ['u1/keep-t.jpg'];
    expect(await files.adminCleanQueuedFiles()).toBe(1);
    expect(fake.state.removed).toEqual([{ bucket: 'job-files', paths: ['u1/gone.jpg'] }]);
    const del = fake.state.calls.find((c) => c.table === 'file_cleanup_queue' && c.op === 'delete');
    expect(del.ops).toContainEqual(['in', 'path', ['u1/keep.jpg', 'u1/gone.jpg', 'u1/keep-t.jpg']]);
  });

  it('removes in chunks of 100', async () => {
    fake.state.queue = Array.from({ length: 230 }, (_, i) => `u1/f${i}.jpg`);
    expect(await files.adminCleanQueuedFiles()).toBe(230);
    expect(fake.state.removed.map((r) => r.paths.length)).toEqual([100, 100, 30]);
  });
});
