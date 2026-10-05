import { describe, expect, it } from 'vitest';
import { formatPrice, paiseToRupees, rupeesToPaise } from './money';

describe('money', () => {
  it('shows rupees from paise', () => {
    expect(formatPrice(79900)).toBe('₹799');
    expect(formatPrice(0)).toBe('₹0');
    expect(formatPrice(149900)).toBe('₹1,499');
    expect(formatPrice(79950)).toBe('₹799.50');
  });
  it('reads a typed price without rounding mistakes', () => {
    expect(rupeesToPaise('799')).toBe(79900);
    expect(rupeesToPaise(' 1,499.5 ')).toBe(149950);
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('19.99')).toBe(1999);
  });
  it('refuses anything that is not a price', () => {
    for (const bad of ['', 'abc', '-5', '12.345', '1e3', '₹799', '7 99']) expect(rupeesToPaise(bad)).toBeNull();
  });
  it('puts a price back in a box', () => {
    expect(paiseToRupees(79900)).toBe('799');
    expect(paiseToRupees(79950)).toBe('799.5');
  });
});
