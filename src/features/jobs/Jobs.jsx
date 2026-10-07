// Jobs: filter buttons (country, work), search box, and a paged list of ads.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import JobCard from './JobCard';
import SectionHeading from '../../shared/ui/SectionHeading';
import { Empty, JobsStatus } from '../../shared/ui/StateViews';
import { CATEGORIES, COUNTRIES, EXPERIENCE } from '../../shared/lib/catalog';
import { useJobs } from './JobsContext';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';
import { withParam } from '../../shared/lib/urlParams';

const PAGE = 5;

/** Jobs list screen. Filters live in the URL (?country=uae&category=driver&q=dubai) so links can be shared. */
export default function Jobs({ fixedCountry = '' }) {
  const { t } = useLang();
  const { jobs, status, reload } = useJobs();
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const fixed = fixedCountry ? COUNTRIES.find((c) => c.id === fixedCountry) : null;
  usePageMeta(fixed ? t.countryJobsTitle(t.country[fixed.id]) : t.jobsTitle, fixed ? t.metaCountry(t.country[fixed.id]) : t.metaJobs);

  const country = fixedCountry || params.get('country') || '';
  const experience = params.get('experience') || '';
  const category = params.get('category') || '';
  const q = params.get('q') || '';

  const setParam = (key, value) => {
    setParams((prev) => withParam(prev, key, value), { replace: true });
    setShown(PAGE);
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (country && j.country !== country) return false;
      if (category && j.category !== category) return false;
      if (experience && j.experienceLevel !== experience) return false;
      if (!needle) return true;
      return [j.title, j.city, j.company, t.country[j.country], t.category[j.category]].join(' ').toLowerCase().includes(needle);
    });
  }, [jobs, country, category, experience, q, t]);

  const filtered = (!fixedCountry && country) || category || experience || q;

  return (
    <div className="page">
      <SectionHeading as="h1" icon="briefcase" title={fixed ? t.countryJobsTitle(t.country[fixed.id]) : t.jobsTitle} help={fixed ? t.countryJobsIntro(t.country[fixed.id]) : t.jobsHelp} />

      <div className="filters">
        <label className="search">
          <span className="sr-only">{t.searchLabel}</span>
          <Icon name="search" size={24} />
          <input
            type="search"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder={t.searchPlaceholder}
            enterKeyHint="search"
          />
        </label>

        {!fixedCountry && (
        <fieldset className="chips">
          <legend>{t.countryFilter}</legend>
          <button type="button" className="chip" aria-pressed={!country} onClick={() => setParam('country', '')}>
            <Icon name="globe" size={22} />{t.allCountries}
          </button>
          {COUNTRIES.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={country === c.id} onClick={() => setParam('country', c.id)}>
              <span className="flag" aria-hidden="true">{c.flag}</span>{t.country[c.id]}
            </button>
          ))}
        </fieldset>
        )}

        <fieldset className="chips">
          <legend>{t.workFilter}</legend>
          <button type="button" className="chip" aria-pressed={!category} onClick={() => setParam('category', '')}>
            <Icon name="grid" size={22} />{t.allWork}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => setParam('category', c.id)}>
              <Icon name={c.icon} size={22} />{t.category[c.id]}
            </button>
          ))}
        </fieldset>
        <fieldset className="chips">
          <legend>{t.experienceFilter}</legend>
          <button type="button" className="chip" aria-pressed={!experience} onClick={() => setParam('experience', '')}>
            <Icon name="grid" size={22} />{t.allExperience}
          </button>
          {EXPERIENCE.map((x) => (
            <button key={x} type="button" className="chip" aria-pressed={experience === x} onClick={() => setParam('experience', x)}>
              <Icon name="hardhat" size={22} />{t.exp[x]}
            </button>
          ))}
        </fieldset>
      </div>

      <JobsStatus status={status} onRetry={reload} />

      {status === 'ready' && (
        list.length === 0 ? (
          <Empty onClear={filtered ? () => setParams({}, { replace: true }) : undefined} />
        ) : (
          <>
            <p className="count" aria-live="polite">{t.jobsFound(list.length)}</p>
            <div className="job-list">{list.slice(0, shown).map((j) => <JobCard key={j.id} job={j} headingLevel={2} />)}</div>
            {list.length > shown && (
              <div className="more">
                <Button tone="outline" icon="plus" onClick={() => setShown((s) => s + PAGE)}>{t.showMore}</Button>
                <p className="help center">{t.showing(Math.min(shown, list.length), list.length)}</p>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
