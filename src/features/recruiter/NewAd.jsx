// /dashboard/new - post an ad (or start one from an ended ad with ?renew=ID). It goes to the admin for approval; there is no payment.
import { useNavigate, useSearchParams } from 'react-router-dom';
import JobForm from '../ads/JobForm';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../../shared/i18n/LangContext';
import NeedVerification from './NeedVerification';
import { useAsync } from '../../shared/lib/useAsync';

/** New / renewed ad form. */
export default function NewAd() {
  const { t } = useLang();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const renewId = params.get('renew');

  const data = useAsync(async () => {
    const mine = renewId ? await api.listMyJobs(user.id) : [];
    return { renewFrom: renewId ? mine.find((j) => j.id === renewId) || null : null };
  }, [renewId, user.id]);

  if (profile?.blocked) return <Notice tone="error">{t.blockedNote}</Notice>;
  // only a verified employer (or an admin) can start an ad; the database enforces this too (migration 0027)
  if (profile && !profile.verified && profile.role !== 'admin') return <NeedVerification profile={profile} />;

  return (
    <section className="section narrow-form">
      <h2 className="section-title">{t.formNew}</h2>
      <AsyncView state={data} isEmpty={() => false}>
        {({ renewFrom }) => (
          <JobForm
            key={renewFrom?.id || 'new'}
            mode="new"
            renewFrom={renewFrom}
            onSaved={() => navigate('/dashboard', { state: { notice: t.adSentForApproval } })}
          />
        )}
      </AsyncView>
    </section>
  );
}
