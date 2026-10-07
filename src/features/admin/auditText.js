// Turns one audit log line into a short sentence: which fields changed, from what, to what.

const HIDDEN = new Set(['id', 'created_at']);

/** [{ field, from, to }] for an update; the main fields for an insert or delete. */
export function changedFields(oldValue, newValue) {
  const before = oldValue || {};
  const after = newValue || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !HIDDEN.has(k));
  return keys
    .filter((k) => !oldValue || !newValue || JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, from: before[k] ?? null, to: after[k] ?? null }));
}

/** A value shown to a person. Money fields (…_paise, value of a flat offer) are shown in rupees by the caller through `money`. */
export function showValue(field, value, money) {
  if (value === null || value === undefined || value === '') return '-';
  if (field.endsWith('_paise')) return money(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (/_at$/.test(field)) return String(value).slice(0, 10);
  return String(value);
}
