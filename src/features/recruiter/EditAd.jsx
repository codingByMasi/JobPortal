// /dashboard/edit/:id - change an ad that is still waiting for payment.
import { useNavigate, useParams } from 'react-router-dom';
import JobForm from '../ads/JobForm';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { canEditAsRecruiter } from '../../shared/lib/jobStatus';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** Edit screen for one of the employer's own ads. */
export default function EditAd() {
  const { id } = useParams();
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();

  const data = useAsync(async () => {
    const [packages, mine] = await Promise.all([api.listPackages(), api.listMyJobs(user.id)]);
    return { packages, job: mine.find((j) => j.id === id) || null };
  }, [id, user.id]);

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.formEdit}</h2>
      <AsyncView state={data} isEmpty={() => false}>
        {({ packages, job }) =>
          job && canEditAsRecruiter(job) ? (
            <JobForm mode="edit" job={job} packages={packages} onSaved={() => navigate('/dashboard', { state: { notice: t.adSaved } })} />
          ) : (
            <Notice tone="error">{job ? t.errNotAllowed : t.errNotFound}</Notice>
          )
        }
      </AsyncView>
    </section>
  );
}
