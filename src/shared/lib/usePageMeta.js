// Sets the browser tab title and the search-engine description for the current screen.
// `noindex: true` tells search engines to leave a private page (login, dashboard, admin) out of their lists.
import { useEffect } from 'react';
import { SITE_NAME } from '../../config';

export function usePageMeta(title, description, { noindex = false } = {}) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);

    let robots = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.name = 'robots';
        document.head.append(robots);
      }
      robots.content = 'noindex';
    } else {
      robots?.remove();
    }
  }, [title, description, noindex]);
}
