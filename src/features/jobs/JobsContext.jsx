// Loads the live job ads and shares them (with loading / error state) across all public screens.
// Ads saved from the last visit show at once; fresh ones replace them as soon as they arrive.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, DATA_CHANGED, isDemo } from '../../shared/data';
import { publicJobs } from '../../shared/lib/jobStatus';

const JobsContext = createContext(null);
const CACHE_KEY = 'jobs-abroad-live-v2';

function readCache() {
  if (isDemo) return null; // demo data is local already
  try {
    const rows = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function saveCache(jobs) {
  if (isDemo) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(jobs));
  } catch {
    /* storage full or blocked: just skip saving */
  }
}


/** Fetches the ads when the app opens; `reload` is used by the Retry button. */
export function JobsProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', jobs: [] });
  const latest = useRef(0);

  // `silent` = keep showing the current list while fresh data loads (used when something changed elsewhere)
  const load = useCallback((silent) => {
    const id = ++latest.current;
    const cached = readCache();
    setState((s) => {
      if (cached) return { status: 'ready', jobs: publicJobs(cached) };
      return silent && s.status === 'ready' ? s : { status: 'loading', jobs: [] };
    });

    api
      .listLiveJobs()
      .then((jobs) => {
        saveCache(jobs);
        if (id === latest.current) setState({ status: 'ready', jobs: publicJobs(jobs) });
      })
      .catch(() => {
        // keep showing saved ads if we have them; only show the error when there is nothing to show
        if (id === latest.current) setState((s) => (s.status === 'ready' ? s : { status: 'error', jobs: [] }));
      });
  }, []);

  const reload = useCallback(() => load(false), [load]);

  useEffect(() => {
    reload();
    const onChange = () => load(true);
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [reload, load]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export const useJobs = () => useContext(JobsContext);
