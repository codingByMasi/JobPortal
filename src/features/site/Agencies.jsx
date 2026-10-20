// /agencies - the employers whose license our team checked: company, registration number, live ads, and a link to see their ads.
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAsync } from '../../shared/lib/useAsync';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Public list of verified agencies. */
export default function Agencies() {
  const { t } = useLang();
  usePageMeta(t.agenciesTitle, t.metaAgencies);
  const list = useAsync(() => api.listVerifiedAgencies(), []);
  return (
    <div className="page">
      <SectionHeading as="h1" icon="badge" title={t.agenciesTitle} help={t.agenciesHelp} />
      <AsyncView state={list} empty={t.agenciesNone} emptyIcon="badge">
        {(rows) => (
          <ul className="agency-list">
            {rows.map((a) => (
              <li key={a.companyName} className="agency-card">
                <h2 className="agency-name"><Icon name="badge" size={24} />{a.companyName}</h2>
                {a.raNumber && <p className="help">{t.raNumberShown(a.raNumber)}</p>}
                <p className="help">{t.agencyAds(a.liveAds)}</p>
                {a.liveAds > 0 && <Button size="sm" tone="outline" icon="search" to={`/jobs?q=${encodeURIComponent(a.companyName)}`}>{t.agencySee}</Button>}
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
      <p className="notice"><Icon name="alert" size={26} /><span>{t.agenciesCheckYourself}</span></p>
      <Button to="/check-agency" tone="blue" icon="shield">{t.checkTitle}</Button>
    </div>
  );
}
