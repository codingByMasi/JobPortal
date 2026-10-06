// Optional "I am not a robot" check (Cloudflare Turnstile). It shows only when VITE_TURNSTILE_SITE_KEY is set.
import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../data/env';
import { useLang } from '../i18n/LangContext';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    const tag = existing || Object.assign(document.createElement('script'), { src: SCRIPT, async: true });
    tag.addEventListener('load', resolve);
    tag.addEventListener('error', reject);
    if (!existing) document.head.append(tag);
  });
}

/** Calls `onToken(token)` when the person passes the check (and `onToken('')` when it expires). Renders nothing without a key. */
export default function Captcha({ onToken }) {
  const { t } = useLang();
  const box = useRef(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return undefined;
    let widget;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current) return;
        widget = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => onToken(''));
    return () => {
      cancelled = true;
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [onToken]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div className="captcha" role="group" aria-label={t.captchaLabel} ref={box} />;
}
