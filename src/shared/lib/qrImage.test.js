import { describe, expect, it } from 'vitest';
import { qrDataUrl } from './qrImage';

describe('qrDataUrl', () => {
  it('makes an SVG picture for a UPI link', () => {
    const url = qrDataUrl('upi://pay?pa=shop%40okbank&pn=Jobs&am=799.00&cu=INR&tn=AD-1A2B3C4D');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(url.split(',')[1]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#fff"');
    expect(svg.length).toBeGreaterThan(500);
  });
  it('is different for different text and the same for the same text', () => {
    expect(qrDataUrl('upi://pay?am=1.00')).not.toBe(qrDataUrl('upi://pay?am=2.00'));
    expect(qrDataUrl('abc')).toBe(qrDataUrl('abc'));
  });
  it('gives nothing for empty text or text too long for a code', () => {
    expect(qrDataUrl('')).toBe('');
    expect(qrDataUrl('x'.repeat(5000))).toBe('');
  });
});
