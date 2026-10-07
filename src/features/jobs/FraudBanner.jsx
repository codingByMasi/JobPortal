// The warning banner shown on Home and on every ad page: never pay for a job.
import Icon from '../../shared/ui/Icon';
import { useLang } from '../../shared/i18n/LangContext';

/** Big, plain warning. Uses role="note" so screen readers read it without interrupting. */
export default function FraudBanner() {
  const { t } = useLang();
  return (
    <aside className="fraud-banner" role="note">
      <Icon name="shield" size={32} />
      <div>
        <strong>{t.fraudBanner}</strong>
        <p>{t.fraudBannerMore}</p>
      </div>
    </aside>
  );
}
