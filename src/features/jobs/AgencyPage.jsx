// /agency?ra=NUMBER - one verified agency: its name, registration number, and the ads it has live now.
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { AsyncView, Empty, JobsStatus } from '../../shared/ui/StateViews';
import JobCard from './JobCard';
import { useJobs } from './JobsContext';
import { api } from '../../shared/data';
import { useAsync } from '../../shared/lib/useAsync';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** Public page of one verified agency. It is found by its registration number, which the ads already show. */
export default function AgencyPage() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const ra = (params.get('ra') || '').trim();
  const { jobs, status, reload } = useJobs();
  const agencies = useAsync(() => api.listVerifiedAgencies(), []);
  usePageMeta(t.agenciesTitle, t.metaAgencies);
  const ads = jobs.filter((j) => j.verified && ra && j.raNumber === ra);

  return (
    <div className="page">
      <AsyncView state={agencies} isEmpty={(rows) => !ra || !rows.some((a) => a.raNumber === ra)} empty={t.agencyMissing} emptyIcon="badge" emptyAction={<Button to="/agencies" tone="outline" icon="badge">{t.agenciesTitle}</Button>}>
        {(rows) => {
          const agency = rows.find((a) => a.raNumber === ra);
          return (
            <>
              <SectionHeading as="h1" icon="badge" title={agency.companyName} help={t.agencyPageHelp} />
              <p className="help ra-line"><Icon name="badge" size={20} />{t.raNumberShown(agency.raNumber)}</p>
              <JobsStatus status={status} onRetry={reload} />
              {status === 'ready' && (ads.length === 0
                ? <Empty text={t.agencyNoAds} icon="briefcase" />
                : (
                  <>
                    <p className="count" aria-live="polite">{t.jobsFound(ads.length)}</p>
                    <div className="job-list">{ads.map((j) => <JobCard key={j.id} job={j} headingLevel={2} />)}</div>
                  </>
                ))}
              <p className="notice"><Icon name="alert" size={26} /><span>{t.agenciesCheckYourself}</span></p>
              <div className="more">
                <Button to="/check-agency" tone="blue" icon="shield">{t.checkTitle}</Button>
                <Button to="/agencies" tone="outline" icon="badge">{t.agenciesTitle}</Button>
              </div>
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}
