// Tests for the reports helper.
import { describe, expect, it } from 'vitest';
import { reportsOpenPerAd } from './reports';

describe('reportsOpenPerAd', () => {
  it('counts only open reports, per ad', () => {
    const rows = [{ jobId: 'a', status: 'open' }, { jobId: 'a', status: 'open' }, { jobId: 'a', status: 'done' }, { jobId: 'b', status: 'dismissed' }, { jobId: 'c', status: 'open' }];
    expect(reportsOpenPerAd(rows)).toEqual({ a: 2, c: 1 });
    expect(reportsOpenPerAd([])).toEqual({});
  });
});
