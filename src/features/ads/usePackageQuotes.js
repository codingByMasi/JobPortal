// Asks the database what each plan costs this employer (best automatic offer, or the typed coupon code). The browser never works out a price itself.
import { useEffect, useState } from 'react';
import { api } from '../../shared/data';

/** `packages` the plans on offer, `code` the applied coupon ('' for none). Returns { quotes: id -> quote, codeProblems: id -> problem word }. */
export function usePackageQuotes(packages, code) {
  const [state, setState] = useState({ quotes: {}, codeProblems: {} });
  const key = packages.map((p) => p.id).join(',');

  useEffect(() => {
    let live = true;
    (async () => {
      const quotes = {};
      const codeProblems = {};
      await Promise.all(packages.map(async (p) => {
        try {
          const auto = await api.quotePrice(p.id, '');
          if (auto.ok) quotes[p.id] = auto;
          if (!code) return;
          const coded = await api.quotePrice(p.id, code);
          if (coded.ok) quotes[p.id] = coded;
          else codeProblems[p.id] = coded.code;
        } catch {
          /* the card then shows the plain price; the real price is worked out again when the order is saved */
        }
      }));
      if (live) setState({ quotes, codeProblems });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, code]);

  return state;
}
