import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes cells with commas, quotes and new lines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(5)).toBe('5');
  });
  it('stops spreadsheet formulas from running', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1+2', '@cmd', '\tx']) expect(csvCell(bad).startsWith("'")).toBe(true);
  });
  it('builds a table with a header row', () => {
    const csv = toCsv([{ n: 'Ram', p: '98765' }], [{ key: 'n', label: 'Name' }, { key: 'p', label: 'Phone' }]);
    expect(csv).toBe('Name,Phone\r\nRam,98765');
  });
});
