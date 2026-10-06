// Gives every network request a time limit, so a bad connection ends in a plain error with Retry instead of an endless spinner.

/** Wraps `fetch`. File uploads and downloads get longer than ordinary data calls. */
export function withTimeout(baseFetch, { dataMs = 20000, fileMs = 90000 } = {}) {
  return (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const ms = url.includes('/storage/v1/') ? fileMs : dataMs;
    if (init.signal || typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return baseFetch(input, init);
    return baseFetch(input, { ...init, signal: AbortSignal.timeout(ms) });
  };
}
