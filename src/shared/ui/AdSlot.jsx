// One Google AdSense ad box. Renders nothing until the publisher ID and this slot's number are set (the Google script itself is in index.html).
import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOTS } from '../data/env';
import { useLang } from '../i18n/LangContext';

/** `slot` is "list" or "job". Public pages only: never put this on login, recruiter or admin screens. */
export default function AdSlot({ slot }) {
  const { t } = useLang();
  const pushed = useRef(false);
  const slotId = ADSENSE_SLOTS[slot];
  const on = Boolean(ADSENSE_CLIENT && slotId);

  useEffect(() => {
    if (!on || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // An ad blocker or a slow network must never break the page.
    }
  }, [on]);

  if (!on) return null;
  return (
    <aside className="ad-slot" aria-label={t.adLabel}>
      <small>{t.adLabel}</small>
      <ins className="adsbygoogle" data-ad-client={ADSENSE_CLIENT} data-ad-slot={slotId} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
