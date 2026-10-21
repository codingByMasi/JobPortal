// A small bar that offers to put the site on the phone's home screen. It shows only when the browser says it can (Chrome on Android and desktop), and not for 30 days after "Not now".
import { useEffect, useState } from 'react';
import Button from '../shared/ui/Button';
import { useLang } from '../shared/i18n/LangContext';
import { INSTALL_KEY, mayAskToInstall } from '../shared/lib/installPrompt';

const remembered = () => {
  try {
    return localStorage.getItem(INSTALL_KEY);
  } catch {
    return null;
  }
};

/** The install bar, or nothing. */
export default function InstallPrompt() {
  const { t } = useLang();
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    if (!mayAskToInstall(remembered())) return undefined;
    const onOffer = (event) => {
      event.preventDefault(); // keep the browser's own small bar away; ours is clearer
      setOffer(event);
    };
    const onInstalled = () => setOffer(null);
    window.addEventListener('beforeinstallprompt', onOffer);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onOffer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!offer) return null;
  const install = async () => {
    offer.prompt();
    await offer.userChoice?.catch(() => {});
    setOffer(null);
  };
  const later = () => {
    try {
      localStorage.setItem(INSTALL_KEY, String(Date.now()));
    } catch {
      // the bar just comes back next time
    }
    setOffer(null);
  };
  return (
    <div className="install-bar" role="region" aria-label={t.installTitle}>
      <div>
        <p className="install-title">{t.installTitle}</p>
        <p>{t.installText}</p>
      </div>
      <div className="install-actions">
        <Button icon="download" onClick={install}>{t.installButton}</Button>
        <Button tone="outline" onClick={later}>{t.installLater}</Button>
      </div>
    </div>
  );
}
