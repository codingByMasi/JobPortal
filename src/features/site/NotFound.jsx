// Shown for any address the app does not know.
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** 404 screen. */
export default function NotFound() {
  const { t } = useLang();
  usePageMeta(t.pageNotFound);
  return (
    <div className="page">
      <div className="state">
        <Icon name="alert" size={56} className="state-icon warn" />
        <h1 className="state-title">{t.pageNotFound}</h1>
        <Button to="/" tone="blue" icon="home">{t.goHome}</Button>
      </div>
    </div>
  );
}
