import { describe, expect, it } from 'vitest';
import { formatSize, pickUnused } from './unusedFiles';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 86400000;
const file = (path, ageDays, size = 1000) => ({ path, size, createdAt: NOW - ageDays * DAY });

describe('pickUnused', () => {
  const jobs = [{ file_path: 'u1/a.jpg', thumb_path: 'u1/a-t.jpg' }, { file_path: 'u2/b.pdf', thumb_path: null }];
  it('keeps files that an ad uses, picture and small picture', () => {
    expect(pickUnused([file('u1/a.jpg', 30), file('u1/a-t.jpg', 30), file('u2/b.pdf', 30)], jobs, NOW)).toEqual([]);
  });
  it('picks files that no ad uses', () => {
    expect(pickUnused([file('u1/old.jpg', 30), file('u1/a.jpg', 30)], jobs, NOW).map((f) => f.path)).toEqual(['u1/old.jpg']);
  });
  it('never picks a file younger than a day (its ad may be saving right now)', () => {
    expect(pickUnused([file('u1/new.jpg', 0.5), file('u1/yesterday.jpg', 1)], jobs, NOW).map((f) => f.path)).toEqual(['u1/yesterday.jpg']);
  });
  it('never picks a file whose age is unknown', () => {
    expect(pickUnused([{ path: 'u1/x.jpg', size: 1, createdAt: null }], [], NOW)).toEqual([]);
  });
  it('with no ads at all every old file is unused', () => {
    expect(pickUnused([file('a/1.jpg', 5), file('a/2.jpg', 5)], [], NOW)).toHaveLength(2);
  });
});

describe('formatSize', () => {
  it('shows KB and MB', () => {
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(5 * 1048576)).toBe('5.0 MB');
    expect(formatSize(0)).toBe('1 KB');
  });
});
