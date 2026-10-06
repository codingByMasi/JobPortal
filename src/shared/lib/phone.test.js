import { describe, expect, it } from 'vitest';
import { isValidPhone, isValidWhatsapp, normalizeWhatsapp } from './phone';

describe('normalizeWhatsapp', () => {
  it('puts 91 in front of a 10-digit Indian mobile number', () => {
    expect(normalizeWhatsapp('9876543210')).toBe('919876543210');
    expect(normalizeWhatsapp('98765 43210')).toBe('919876543210');
    expect(normalizeWhatsapp('09876543210')).toBe('919876543210');
  });
  it('leaves numbers that already have a country code', () => {
    expect(normalizeWhatsapp('+91 98765-43210')).toBe('919876543210');
    expect(normalizeWhatsapp('+971 50 123 4567')).toBe('971501234567');
    expect(normalizeWhatsapp('00971501234567')).toBe('971501234567');
  });
  it('never invents digits for other lengths', () => {
    expect(normalizeWhatsapp('12345')).toBe('12345');
    expect(normalizeWhatsapp('')).toBe('');
  });
});

describe('isValidWhatsapp / isValidPhone', () => {
  it('needs 10 to 15 digits after normalizing', () => {
    expect(isValidWhatsapp('9876543210')).toBe(true);
    expect(isValidWhatsapp('12345')).toBe(false);
    expect(isValidWhatsapp('1'.repeat(16))).toBe(false);
  });
  it('person phone: only digits, plus, space, dash', () => {
    expect(isValidPhone('+91 98765-43210')).toBe(true);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('123')).toBe(false);
  });
});
