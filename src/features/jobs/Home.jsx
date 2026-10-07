// Home: headline, country buttons, kind-of-work buttons, featured ads, latest ads.
import { Link } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import FraudBanner from './FraudBanner';
import HomeCounters from './HomeCounters';
import JobCard from './JobCard';
import SectionHeading from '../../shared/ui/SectionHeading';
import { Empty, JobsStatus } from '../../shared/ui/StateViews';
import { CATEGORIES, COUNTRIES } from '../../shared/lib/catalog';
import { useJobs } from './JobsContext';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

const SHOWN = 3;

/** Home screen. */
export default function Home() {
  const { t } = useLang();
  const { jobs, status, reload } = useJobs();
  usePageMeta('', t.metaHome);

  const featured = jobs.filter((j) => j.featured).slice(0, SHOWN);
  const latest = [...jobs].sort((a, b) => (b.startsAt ?? b.posted ?? 0) - (a.startsAt ?? a.posted ?? 0)).slice(0, SHOWN);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <p className="hero-tag"><Icon name="heart" size={24} />{t.homeTag}</p>
          <h1>{t.homeTitle}</h1>
          <p className="hero-line">{t.homeLine}</p>
          <p className="help">{t.homeSmall}</p>
        </div>
        <div className="hero-picture">
          <picture>
            <source type="image/webp" srcSet="/hero-640.webp 640w, /hero-1200.webp 1200w" sizes="(min-width: 768px) 560px, 100vw" />
            <img src="/hero.jpg" alt="" width="1200" height="896" fetchPriority="high" />
          </picture>
          <span className="picture-note"><Icon name="shield" size={22} />{t.heroNote}</span>
        </div>
      </section>

      <FraudBanner />

      <ul className="trust">
        <li><Icon name="shield" size={24} />{t.trustLogin}</li>
        <li><Icon name="download" size={24} />{t.trustFree}</li>
        <li><Icon name="phone" size={24} />{t.trustHelp}</li>
      </ul>

      <section className="section">
        <SectionHeading icon="flag" title={t.chooseCountry} help={t.chooseCountryHelp} />
        <div className="grid grid-country">
          {COUNTRIES.map((c) => (
            <Link key={c.id} to={`/jobs/${c.slug}`} className="country-btn">
              <span className="flag" aria-hidden="true">{c.flag}</span>
              <span className="country-name">{t.country[c.id]}</span>
              <Icon name="chevron" size={22} />
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHeading icon="briefcase" title={t.chooseWork} help={t.chooseWorkHelp} />
        <div className="grid grid-work">
          {CATEGORIES.map((c) => (
            <Link key={c.id} to={`/jobs?category=${c.id}`} className="work-btn">
              <span className="work-icon"><Icon name={c.icon} size={32} /></span>
              <span>{t.category[c.id]}</span>
            </Link>
          ))}
        </div>
      </section>

      {status === 'ready' && featured.length > 0 && (
        <section className="section">
          <SectionHeading icon="star" title={t.featuredAds} help={t.featuredHelp} />
          <div className="job-list">{featured.map((j) => <JobCard key={j.id} job={j} />)}</div>
        </section>
      )}

      <section className="section">
        <SectionHeading icon="clock" title={t.latestJobs} help={t.latestJobsHelp} />
        <JobsStatus status={status} onRetry={reload} />
        {status === 'ready' && jobs.length === 0 && <Empty />}
        {status === 'ready' && jobs.length > 0 && (
          <>
            <div className="job-list">{latest.map((j) => <JobCard key={j.id} job={j} />)}</div>
            <div className="more"><Button to="/jobs" tone="outline" icon="briefcase">{t.seeAllJobs}</Button></div>
          </>
        )}
      </section>

      <HomeCounters />

      <section className="section">
        <Button to="/post-job" tone="blue" icon="upload">{t.postJobCall}</Button>
      </section>
    </div>
  );
}
