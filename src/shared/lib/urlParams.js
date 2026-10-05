// Helper for filters kept in the page address (?country=uae&status=live).

/**
 * Returns a copy of `params` with `key` set to `value`, or removed when `value` is empty
 * or equals `emptyValue` (like "all"). Used by every filter so they all behave the same.
 */
export function withParam(params, key, value, emptyValue) {
  const next = new URLSearchParams(params);
  if (value && value !== emptyValue) next.set(key, value);
  else next.delete(key);
  return next;
}
