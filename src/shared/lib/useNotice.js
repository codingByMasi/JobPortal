// A small "message after an action" state: success text, or an error turned into plain words.
import { useCallback, useState } from 'react';
import { friendlyMessage } from './friendlyError';
import { useLang } from '../i18n/LangContext';

export function useNotice(initial = '') {
  const { t } = useLang();
  const [notice, setNotice] = useState({ tone: 'success', text: initial });
  const success = useCallback((text) => setNotice({ tone: 'success', text }), []);
  const fail = useCallback((err) => setNotice({ tone: 'error', text: friendlyMessage(err, t) }), [t]);
  const clear = useCallback(() => setNotice({ tone: 'success', text: '' }), []);
  return { notice, success, fail, clear };
}
