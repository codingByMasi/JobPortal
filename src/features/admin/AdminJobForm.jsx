// /admin/jobs/new and /admin/jobs/:id - add an ad that goes live at once, or edit any field of any ad.
import { useNavigate, useParams } from 'react-router-dom';
import JobForm from '../ads/JobForm';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** Admin ad form page. */
export default function AdminJobForm() {
  const { id } = useParams();
  const { t } = useLang();
  const navigate = useNavigate();
  const isNew = !id;

  const data = useAsync(async () => {
    const [packages, jobs] = await Promise.all([api.listPackages(), isNew ? Promise.resolve([]) : api.adminListJobs()]);
    return { packages, job: isNew ? null : jobs.find((j) => j.id === id) || null };
  }, [id]);

  const done = (notice) => navigate('/admin/jobs', { state: { notice } });

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{isNew ? t.adminNewTitle : t.adminEditTitle}</h2>
      <AsyncView state={data} isEmpty={() => false}>
        {({ packages, job }) =>
          isNew ? (
            <JobForm mode="admin-new" packages={packages} onSaved={() => done(t.adApproved)} />
          ) : job ? (
            <JobForm mode="admin-edit" job={job} packages={packages} onSaved={() => done(t.saved)} />
          ) : (
            <Notice tone="error">{t.errNotFound}</Notice>
          )
        }
      </AsyncView>
    </section>
  );
}
