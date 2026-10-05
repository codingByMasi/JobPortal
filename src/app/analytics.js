// Optional privacy-friendly visit counter (Plausible). Does nothing until ANALYTICS_DOMAIN is set in config.js.
import { ANALYTICS_DOMAIN, isPlaceholder } from '../config';

export function startAnalytics() {
  if (isPlaceholder(ANALYTICS_DOMAIN)) return;
  const script = document.createElement('script');
  script.defer = true;
  script.dataset.domain = ANALYTICS_DOMAIN;
  script.src = 'https://plausible.io/js/script.js';
  document.head.append(script);
}
