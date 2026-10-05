// Runs a data-loading function and reports { status, data, error, reload }.
// While reloading, the old `data` stays so a screen does not flash empty after every button press.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(load, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const id = ++latest.current;
    setState((s) => ({ ...s, status: s.data ? 'ready' : 'loading', error: null }));
    loadRef
      .current()
      .then((data) => id === latest.current && setState({ status: 'ready', data, error: null }))
      .catch((error) => id === latest.current && setState({ status: 'error', data: null, error }));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);
  return { ...state, reload: run };
}
