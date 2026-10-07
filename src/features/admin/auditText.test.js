import { describe, expect, it } from 'vitest';
import { changedFields, showValue } from './auditText';

describe('changedFields', () => {
  it('lists only what changed in an update', () => {
    expect(changedFields({ id: 1, price_paise: 100, name: 'A' }, { id: 1, price_paise: 200, name: 'A' })).toEqual([{ field: 'price_paise', from: 100, to: 200 }]);
  });
  it('lists the fields of an insert or delete', () => {
    expect(changedFields(null, { id: 1, name: 'A' })).toEqual([{ field: 'name', from: null, to: 'A' }]);
    expect(changedFields({ id: 1, name: 'A' }, null)).toEqual([{ field: 'name', from: 'A', to: null }]);
  });
});

describe('showValue', () => {
  it('shows money, empty values and yes/no', () => {
    expect(showValue('price_paise', 100, (n) => `R${n}`)).toBe('R100');
    expect(showValue('x', null, String)).toBe('-');
    expect(showValue('active', true, String)).toBe('yes');
  });
});
