// Post a Job: 3 short steps, then the right button for a visitor or a logged-in employer.
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { api } from '../../shared/data';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';
import { AsyncView } from '../../shared/ui/StateViews';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Post a Job screen. */
export default function PostJob() {
  const { t } = useLang();
  const { user } = useAuth();
  usePageMeta(t.postTitle);
  const packages = useAsync(() => api.listPackages(), []);
  const steps = [
    { icon: 'user', text: t.postStep1 },
    { icon: 'upload', text: t.postStep2 },
    { icon: 'rupee', text: t.postStep3 },
  ];
  return (
    <div className="page">
      <SectionHeading as="h1" icon="upload" title={t.postTitle} help={t.postHelp} />
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.icon}>
            <span className="step-num">{i + 1}</span>
            <Icon name={s.icon} size={30} />
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <section className="section">
        <SectionHeading as="h2" icon="rupee" title={t.postPricesTitle} help={t.postPricesHelp} />
        <AsyncView state={packages} isEmpty={(list) => !list.filter((p) => p.active).length} empty={t.errNotFound}>
          {(list) => (
            <div className="package-grid">
              {list.filter((p) => p.active).map((p) => (
                <div key={p.id} className={`package-card${p.featured ? ' is-featured' : ''}`}>
                  {p.featured && <span className="tag tag-featured"><Icon name="star" size={16} />{t.tagFeatured}</span>}
                  <span className="package-name">{p.name}</span>
                  <span className="package-price">{formatPrice(p.pricePaise)}</span>
                  <span className="package-days">{t.pkgDays(p.durationDays)}</span>
                </div>
              ))}
            </div>
          )}
        </AsyncView>
      </section>
      <div className="actions">
        {user ? (
          <Button to="/dashboard/new" icon="upload">{t.postGo}</Button>
        ) : (
          <>
            <Button to="/signup" icon="user">{t.postStart}</Button>
            <Button to="/login" tone="outline" icon="logout">{t.postHave}</Button>
          </>
        )}
      </div>
    </div>
  );
}
