import { describe, expect, it } from 'vitest';
import { safeHttpsUrl } from './safeUrl.js';

describe('safeHttpsUrl', () => {
  it('lets https links through', () => {
    expect(safeHttpsUrl(' https://drive.google.com/file/d/1/view ')).toBe('https://drive.google.com/file/d/1/view');
  });
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<b>x</b>',
    'http://example.com/a.jpg',
    'ftp://x.com',
    '//evil.com',
    'not a link',
    '',
  ])('blocks %s', (bad) => expect(safeHttpsUrl(bad)).toBe(''));
});
