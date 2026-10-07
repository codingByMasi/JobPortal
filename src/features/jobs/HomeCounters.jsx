// Three real numbers from the database on the home page. A number is shown only when it is above zero; with none, the section is not shown.
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { api } from '../../shared/data';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** Counters section. Shows nothing while loading, on an error, or when every number is zero. */
export default function HomeCounters() {
  const { t } = useLang();
  const counts = useAsync(() => api.getPublicCounts(), []);
  if (counts.status !== 'ready' || !counts.data) return null;
  const items = [
    { key: 'live', icon: 'eye', n: counts.data.liveAds, label: t.counterLive },
    { key: 'verified', icon: 'badge', n: counts.data.verifiedRecruiters, label: t.counterVerified },
    { key: 'apps', icon: 'users', n: counts.data.applications, label: t.counterApplications },
  ].filter((x) => x.n > 0);
  if (items.length === 0) return null;
  return (
    <section className="section">
      <SectionHeading icon="grid" title={t.countersTitle} />
      <ul className="counters">
        {items.map((x) => (
          <li key={x.key}>
            <Icon name={x.icon} size={28} />
            <span className="counter-number">{x.n.toLocaleString('en-IN')}</span>
            <span>{x.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
