// /dashboard/new - post an ad (or start one from an ended ad with ?renew=ID), then go to payment.
import { useNavigate, useSearchParams } from 'react-router-dom';
import JobForm from '../ads/JobForm';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import { startPayment } from '../payments/payments';
import { useAsync } from '../../shared/lib/useAsync';

/** New / renewed ad form. */
export default function NewAd() {
  const { t } = useLang();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const renewId = params.get('renew');

  const data = useAsync(async () => {
    const [packages, mine] = await Promise.all([api.listPackages(), renewId ? api.listMyJobs(user.id) : Promise.resolve([])]);
    return { packages, renewFrom: renewId ? mine.find((j) => j.id === renewId) || null : null };
  }, [renewId, user.id]);

  if (profile?.blocked) return <Notice tone="error">{t.blockedNote}</Notice>;

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.formNew}</h2>
      <AsyncView state={data} isEmpty={() => false}>
        {({ packages, renewFrom }) => (
          <JobForm
            key={renewFrom?.id || 'new'}
            mode="new"
            packages={packages}
            renewFrom={renewFrom}
            onSaved={(job) => startPayment(job, navigate)}
          />
        )}
      </AsyncView>
    </section>
  );
}
