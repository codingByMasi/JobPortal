// The one place screens talk to for data: `api.listLiveJobs()`, `api.createJob(...)`, ...
// It picks the real backend (Supabase) or the demo backend, and loads only the one that is needed.
// RULE: nothing outside src/shared/data may import the Supabase library or touch the database.
import { hasSupabase } from './env';

/** Names of data functions that can change what visitors see (so the public list should reload afterwards). */
export const changesPublicData = (name) =>
  /^(createJob|updateJob|deleteJob)$/.test(name) || (/^admin/.test(name) && !/^admin(List|Counts)/.test(name));

export const DATA_CHANGED = 'jobs-abroad:data-changed';

let loaded;
const backend = () => {
  loaded ||= hasSupabase
    ? import('./supabase/index').then((m) => m.supabaseApi)
    : import('./demo/index').then((m) => m.demoApi);
  return loaded;
};

export const api = new Proxy({}, {
  get(_target, name) {
    if (name === 'mode') return hasSupabase ? 'supabase' : 'demo';
    if (name === 'onAuthChange') {
      return (cb) => {
        let stop;
        let cancelled = false;
        backend().then((b) => {
          if (!cancelled) stop = b.onAuthChange(cb);
        });
        return () => {
          cancelled = true;
          stop?.();
        };
      };
    }
    return async (...args) => {
      const b = await backend();
      if (typeof b[name] !== 'function') throw new Error(`api.${String(name)} does not exist`);
      const result = await b[name](...args);
      if (changesPublicData(name) && typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED));
      return result;
    };
  },
});

export const isDemo = !hasSupabase;
