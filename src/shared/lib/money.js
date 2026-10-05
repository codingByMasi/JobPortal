// Prices are stored in paise (100 paise = 1 rupee) and shown in rupees.

/** 79900 -> "₹799". Shows paise only when there are some (₹799.50). */
export function formatPrice(paise = 0) {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2 })}`;
}

/** Rupees typed in a box ("799" or "799.50") -> paise. Returns null for anything that is not a price. */
export function rupeesToPaise(text) {
  const s = String(text).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** 79900 -> "799" for putting a price back into a box. */
export const paiseToRupees = (paise = 0) => String(paise / 100);
