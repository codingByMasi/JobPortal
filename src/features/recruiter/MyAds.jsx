// Employer's ads with their status in plain words, and the buttons that make sense for each status.
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import Modal from '../../shared/ui/Modal';
import Notice from '../../shared/ui/Notice';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAuth } from '../auth/AuthContext';
import { countryById } from '../../shared/lib/catalog';
import { friendlyMessage } from '../../shared/lib/friendlyError';
import { describeStatus, formatDate } from '../../shared/lib/format';
import { canEditAsRecruiter, canRenew, effectiveStatus } from '../../shared/lib/jobStatus';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';

/** /dashboard - the employer's own ads. */
export default function MyAds() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const location = useLocation();
  const ads = useAsync(() => api.listMyJobs(user.id), [user.id]);
  const [toDelete, setToDelete] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: location.state?.notice || '' });
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteJob(toDelete);
      setNotice({ tone: 'success', text: t.adDeleted });
      ads.reload();
    } catch (err) {
      setNotice({ tone: 'error', text: friendlyMessage(err, t) });
    } finally {
      setBusy(false);
      setToDelete(null);
    }
  };

  return (
    <section className="section">
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView
        state={ads}
        empty={t.noAds}
        emptyIcon="list"
        emptyAction={<Button to="/dashboard/new" icon="plus">{t.postFirst}</Button>}
      >
        {(jobs) => (
          <div className="job-list">
            {jobs.map((job) => {
              const status = effectiveStatus(job);
              return (
                <article key={job.id} className="job-card ad-row">
                  <div className="job-info">
                    <div className="job-meta">
                      <StatusBadge job={job} />
                      <span className="job-date">{formatDate(job.posted, lang)}</span>
                    </div>
                    <h3 className="job-title">{job.title}</h3>
                    <p className="job-place">
                      <span className="flag" aria-hidden="true">{countryById(job.country).flag}</span>
                      <Icon name="pin" size={20} />
                      <span>{[job.city, t.country[job.country]].filter(Boolean).join(', ')}</span>
                    </p>
                    <p className={`status-line status-${status}`}>{describeStatus(job, t, lang)}</p>
                    {job.package && <p className="help">{t.package}: {job.package.name} · {formatPrice(job.package.pricePaise)}</p>}
                  </div>
                  <div className="row-actions">
                    {canEditAsRecruiter(job) && <Button to={`/dashboard/pay/${job.id}`} icon="rupee">{t.payNow}</Button>}
                    {canEditAsRecruiter(job) && <Button to={`/dashboard/edit/${job.id}`} tone="outline" icon="edit">{t.edit}</Button>}
                    {status === 'live' && <Button to={`/job/${job.id}`} tone="outline" icon="eye">{t.seeAd}</Button>}
                    {canRenew(job) && <Button to={`/dashboard/new?renew=${job.id}`} tone="blue" icon="refresh">{t.renew}</Button>}
                    <Button tone="danger" icon="trash" onClick={() => setToDelete(job)}>{t.delete}</Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AsyncView>

      {toDelete && (
        <Modal title={t.deleteAsk} onClose={() => setToDelete(null)}>
          <p className="modal-text"><strong>{toDelete.title}</strong></p>
          <p className="modal-text">{t.deleteText}</p>
          <Button tone="danger" icon="trash" onClick={remove} disabled={busy}>{busy ? t.saving : t.yesDelete}</Button>
        </Modal>
      )}
    </section>
  );
}
